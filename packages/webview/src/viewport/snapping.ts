import type { DistanceIndicator, GuideLine, Rect } from "./types";

export interface SnappingResult {
    readonly snappedRect: Rect;
    readonly guides: readonly GuideLine[];
    readonly distanceIndicators: readonly DistanceIndicator[];
}

interface SnapMatch {
    readonly delta: number;
    readonly guidePosition: number;
    readonly guideStart: number;
    readonly guideEnd: number;
}

export function computeSnapping(
    candidateRect: Rect,
    parentRect: Rect | null,
    siblingRects: readonly Rect[],
    options: {
        readonly snapToGrid: boolean;
        readonly snapToObjects: boolean;
        readonly gridSize: number;
        readonly threshold: number;
    }
): SnappingResult {
    const { snapToGrid, snapToObjects, gridSize, threshold } = options;

    let snappedX = candidateRect.x;
    let snappedY = candidateRect.y;
    const guides: GuideLine[] = [];
    const distanceIndicators: DistanceIndicator[] = [];

    const candidateLeft = candidateRect.x;
    const candidateCenterX = candidateRect.x + candidateRect.width / 2;
    const candidateRight = candidateRect.x + candidateRect.width;

    const candidateTop = candidateRect.y;
    const candidateCenterY = candidateRect.y + candidateRect.height / 2;
    const candidateBottom = candidateRect.y + candidateRect.height;

    let bestMatchX: SnapMatch | null = null;
    let bestDistX = threshold + 1;

    let bestMatchY: SnapMatch | null = null;
    let bestDistY = threshold + 1;

    if (snapToObjects) {
        const referenceBoxes: Rect[] = [];
        if (parentRect) {
            referenceBoxes.push(parentRect);
        }
        for (const sibling of siblingRects) {
            referenceBoxes.push(sibling);
        }

        for (const ref of referenceBoxes) {
            const refLeft = ref.x;
            const refCenterX = ref.x + ref.width / 2;
            const refRight = ref.x + ref.width;

            const refTop = ref.y;
            const refCenterY = ref.y + ref.height / 2;
            const refBottom = ref.y + ref.height;

            const xPairs = [
                { cand: candidateLeft, target: refLeft, offset: 0 },
                { cand: candidateLeft, target: refRight, offset: 0 },
                { cand: candidateCenterX, target: refCenterX, offset: candidateRect.width / 2 },
                { cand: candidateRight, target: refLeft, offset: candidateRect.width },
                { cand: candidateRight, target: refRight, offset: candidateRect.width },
            ];

            for (const pair of xPairs) {
                const diff = pair.target - pair.cand;
                const absDiff = Math.abs(diff);
                if (absDiff <= threshold && absDiff < bestDistX) {
                    bestDistX = absDiff;
                    const startY = Math.min(candidateTop, refTop) - 20;
                    const endY = Math.max(candidateBottom, refBottom) + 20;
                    bestMatchX = {
                        delta: diff,
                        guidePosition: pair.target,
                        guideStart: startY,
                        guideEnd: endY,
                    };
                }
            }

            const yPairs = [
                { cand: candidateTop, target: refTop, offset: 0 },
                { cand: candidateTop, target: refBottom, offset: 0 },
                { cand: candidateCenterY, target: refCenterY, offset: candidateRect.height / 2 },
                { cand: candidateBottom, target: refTop, offset: candidateRect.height },
                { cand: candidateBottom, target: refBottom, offset: candidateRect.height },
            ];

            for (const pair of yPairs) {
                const diff = pair.target - pair.cand;
                const absDiff = Math.abs(diff);
                if (absDiff <= threshold && absDiff < bestDistY) {
                    bestDistY = absDiff;
                    const startX = Math.min(candidateLeft, refLeft) - 20;
                    const endX = Math.max(candidateRight, refRight) + 20;
                    bestMatchY = {
                        delta: diff,
                        guidePosition: pair.target,
                        guideStart: startX,
                        guideEnd: endX,
                    };
                }
            }
        }
    }

    if (snapToGrid) {
        if (!bestMatchX) {
            const gridSnapLeft = Math.round(candidateLeft / gridSize) * gridSize;
            const diffLeft = gridSnapLeft - candidateLeft;
            if (Math.abs(diffLeft) <= threshold) {
                bestMatchX = {
                    delta: diffLeft,
                    guidePosition: gridSnapLeft,
                    guideStart: candidateTop - 30,
                    guideEnd: candidateBottom + 30,
                };
            }
        }

        if (!bestMatchY) {
            const gridSnapTop = Math.round(candidateTop / gridSize) * gridSize;
            const diffTop = gridSnapTop - candidateTop;
            if (Math.abs(diffTop) <= threshold) {
                bestMatchY = {
                    delta: diffTop,
                    guidePosition: gridSnapTop,
                    guideStart: candidateLeft - 30,
                    guideEnd: candidateRight + 30,
                };
            }
        }
    }

    if (bestMatchX) {
        snappedX += bestMatchX.delta;
        guides.push({
            orientation: "vertical",
            position: bestMatchX.guidePosition,
            start: bestMatchX.guideStart,
            end: bestMatchX.guideEnd,
        });
    }

    if (bestMatchY) {
        snappedY += bestMatchY.delta;
        guides.push({
            orientation: "horizontal",
            position: bestMatchY.guidePosition,
            start: bestMatchY.guideStart,
            end: bestMatchY.guideEnd,
        });
    }

    for (const sib of siblingRects) {
        const sibRight = sib.x + sib.width;
        const sibBottom = sib.y + sib.height;

        const verticalOverlap =
            snappedY < sibBottom && snappedY + candidateRect.height > sib.y;

        if (verticalOverlap) {
            if (snappedX > sibRight) {
                const gap = Math.round(snappedX - sibRight);
                if (gap > 0 && gap <= 400) {
                    const midY =
                        Math.max(snappedY, sib.y) +
                        (Math.min(snappedY + candidateRect.height, sibBottom) -
                            Math.max(snappedY, sib.y)) /
                            2;
                    distanceIndicators.push({
                        x1: sibRight,
                        y1: midY,
                        x2: snappedX,
                        y2: midY,
                        distance: gap,
                        orientation: "horizontal",
                    });
                }
            } else if (sib.x > snappedX + candidateRect.width) {
                const gap = Math.round(sib.x - (snappedX + candidateRect.width));
                if (gap > 0 && gap <= 400) {
                    const midY =
                        Math.max(snappedY, sib.y) +
                        (Math.min(snappedY + candidateRect.height, sibBottom) -
                            Math.max(snappedY, sib.y)) /
                            2;
                    distanceIndicators.push({
                        x1: snappedX + candidateRect.width,
                        y1: midY,
                        x2: sib.x,
                        y2: midY,
                        distance: gap,
                        orientation: "horizontal",
                    });
                }
            }
        }

        const horizontalOverlap =
            snappedX < sibRight && snappedX + candidateRect.width > sib.x;

        if (horizontalOverlap) {
            if (snappedY > sibBottom) {
                const gap = Math.round(snappedY - sibBottom);
                if (gap > 0 && gap <= 400) {
                    const midX =
                        Math.max(snappedX, sib.x) +
                        (Math.min(snappedX + candidateRect.width, sibRight) -
                            Math.max(snappedX, sib.x)) /
                            2;
                    distanceIndicators.push({
                        x1: midX,
                        y1: sibBottom,
                        x2: midX,
                        y2: snappedY,
                        distance: gap,
                        orientation: "vertical",
                    });
                }
            } else if (sib.y > snappedY + candidateRect.height) {
                const gap = Math.round(sib.y - (snappedY + candidateRect.height));
                if (gap > 0 && gap <= 400) {
                    const midX =
                        Math.max(snappedX, sib.x) +
                        (Math.min(snappedX + candidateRect.width, sibRight) -
                            Math.max(snappedX, sib.x)) /
                            2;
                    distanceIndicators.push({
                        x1: midX,
                        y1: snappedY + candidateRect.height,
                        x2: midX,
                        y2: sib.y,
                        distance: gap,
                        orientation: "vertical",
                    });
                }
            }
        }
    }

    return {
        snappedRect: {
            x: Math.round(snappedX),
            y: Math.round(snappedY),
            width: candidateRect.width,
            height: candidateRect.height,
        },
        guides,
        distanceIndicators,
    };
}

