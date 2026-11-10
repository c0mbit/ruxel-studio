use rux_ast::layout::{
    AbsolutePosition, AlignItems, AlignSelf, AnchorConstraints, ContainerLayout, Dimensions,
    FlexContainer, FlexDirection, FlexItem, FlexWrap, JustifyContent, RectOffsets, Size, Spacing,
    WidgetLayout,
};
use rux_ast::widget::{WidgetNode, WidgetProperties, WidgetType};
use uuid::Uuid;

use crate::models::{FigmaBoundingBox, FigmaNode};

pub struct GeometryResolver;

impl GeometryResolver {
    pub fn new() -> Self {
        Self
    }

    pub fn resolve_node_layout(&self, figma_node: &FigmaNode) -> WidgetLayout {
        let container = self.resolve_container_layout(figma_node);
        let dimensions = self.resolve_dimensions(figma_node);
        let spacing = self.resolve_spacing(figma_node);
        let flex_item = self.resolve_flex_item(figma_node);

        WidgetLayout {
            container,
            dimensions,
            spacing,
            absolute: None,
            anchor: None,
            border: None,
            grid: None,
            flex_item,
        }
    }

    pub fn resolve_container_layout(&self, figma_node: &FigmaNode) -> Option<ContainerLayout> {
        let mode = figma_node.layout_mode.as_deref().unwrap_or("NONE");
        let is_wrap = figma_node.layout_wrap.as_deref() == Some("WRAP");
        let name_lower = figma_node.name.to_lowercase();
        let is_grid = is_wrap || name_lower.contains("grid") || mode == "GRID";

        if is_grid {
            let col_gap = figma_node.item_spacing.or(figma_node.spacing).unwrap_or(0.0).max(0.0);
            let row_gap = figma_node.counter_axis_spacing.unwrap_or(col_gap).max(0.0);
            return Some(ContainerLayout::Grid(rux_ast::layout::GridContainer {
                columns: vec![rux_ast::layout::GridTrack::Fr(1.0), rux_ast::layout::GridTrack::Fr(1.0)],
                rows: vec![rux_ast::layout::GridTrack::Auto],
                column_gap: col_gap,
                row_gap,
                justify_items: None,
                align_items: None,
            }));
        }

        match mode {
            "HORIZONTAL" => {
                let justify_content = self.map_primary_align(
                    figma_node.primary_axis_align_items.as_deref().unwrap_or("MIN"),
                );
                let align_items = self.map_counter_align(
                    figma_node.counter_axis_align_items.as_deref().unwrap_or("MIN"),
                );
                let gap = figma_node.item_spacing.or(figma_node.spacing).unwrap_or(0.0).max(0.0);

                Some(ContainerLayout::Flex(FlexContainer {
                    direction: FlexDirection::Row,
                    wrap: FlexWrap::NoWrap,
                    justify_content,
                    align_items,
                    gap,
                }))
            }
            "VERTICAL" => {
                let justify_content = self.map_primary_align(
                    figma_node.primary_axis_align_items.as_deref().unwrap_or("MIN"),
                );
                let align_items = self.map_counter_align(
                    figma_node.counter_axis_align_items.as_deref().unwrap_or("MIN"),
                );
                let gap = figma_node.item_spacing.or(figma_node.spacing).unwrap_or(0.0).max(0.0);

                Some(ContainerLayout::Flex(FlexContainer {
                    direction: FlexDirection::Column,
                    wrap: FlexWrap::NoWrap,
                    justify_content,
                    align_items,
                    gap,
                }))
            }
            _ => {
                if figma_node.is_frame_or_group() && !figma_node.children.is_empty() {
                    Some(ContainerLayout::Flex(FlexContainer {
                        direction: FlexDirection::Column,
                        wrap: FlexWrap::NoWrap,
                        justify_content: JustifyContent::FlexStart,
                        align_items: AlignItems::Stretch,
                        gap: 0.0,
                    }))
                } else {
                    None
                }
            }
        }
    }

    pub fn resolve_dimensions(&self, figma_node: &FigmaNode) -> Dimensions {
        let mut dimensions = Dimensions::default();

        if let Some(ref bbox) = figma_node.absolute_bounding_box {
            dimensions.width = Size::Fixed(bbox.width.round());
            dimensions.height = Size::Fixed(bbox.height.round());
        }

        if let Some(ref mode) = figma_node.layout_mode {
            if mode == "HORIZONTAL" {
                if figma_node.primary_axis_sizing_mode.as_deref() == Some("AUTO") {
                    dimensions.width = Size::HugContent;
                }
                if figma_node.counter_axis_sizing_mode.as_deref() == Some("AUTO") {
                    dimensions.height = Size::HugContent;
                }
            } else if mode == "VERTICAL" {
                if figma_node.counter_axis_sizing_mode.as_deref() == Some("AUTO") {
                    dimensions.width = Size::HugContent;
                }
                if figma_node.primary_axis_sizing_mode.as_deref() == Some("AUTO") {
                    dimensions.height = Size::HugContent;
                }
            }
        }

        if figma_node.layout_grow == Some(1.0)
            || figma_node.fill_width == Some(true)
            || figma_node.layout_sizing_horizontal.as_deref() == Some("FILL")
            || (figma_node.layout_mode.as_deref() == Some("HORIZONTAL") && figma_node.layout_grow == Some(1.0))
            || (figma_node.layout_mode.as_deref() == Some("VERTICAL") && figma_node.layout_align.as_deref() == Some("STRETCH"))
        {
            dimensions.width = Size::Fill(1.0);
        }

        if figma_node.fill_height == Some(true)
            || figma_node.layout_sizing_vertical.as_deref() == Some("FILL")
            || (figma_node.layout_mode.as_deref() == Some("VERTICAL") && figma_node.layout_grow == Some(1.0))
            || (figma_node.layout_mode.as_deref() == Some("HORIZONTAL") && figma_node.layout_align.as_deref() == Some("STRETCH"))
        {
            dimensions.height = Size::Fill(1.0);
        }

        dimensions
    }

    pub fn resolve_spacing(&self, figma_node: &FigmaNode) -> Spacing {
        let pad_top = figma_node.padding_top.or(figma_node.padding).unwrap_or(0.0).max(0.0);
        let pad_right = figma_node.padding_right.or(figma_node.padding).unwrap_or(0.0).max(0.0);
        let pad_bottom = figma_node.padding_bottom.or(figma_node.padding).unwrap_or(0.0).max(0.0);
        let pad_left = figma_node.padding_left.or(figma_node.padding).unwrap_or(0.0).max(0.0);

        let padding = RectOffsets {
            top: pad_top,
            right: pad_right,
            bottom: pad_bottom,
            left: pad_left,
        };

        Spacing {
            padding,
            margin: RectOffsets::default(),
        }
    }

    pub fn resolve_flex_item(&self, figma_node: &FigmaNode) -> Option<FlexItem> {
        let grow = figma_node.layout_grow.unwrap_or(0.0);
        let align_self = match figma_node.layout_align.as_deref() {
            Some("STRETCH") => AlignSelf::Stretch,
            Some("MIN") => AlignSelf::FlexStart,
            Some("CENTER") => AlignSelf::Center,
            Some("MAX") => AlignSelf::FlexEnd,
            _ => AlignSelf::Auto,
        };

        if grow > 0.0 || align_self != AlignSelf::Auto {
            Some(FlexItem {
                grow,
                shrink: 1.0,
                basis: None,
                align_self,
            })
        } else {
            None
        }
    }

    pub fn resolve_freeform_children(
        &self,
        parent_box: &FigmaBoundingBox,
        child_nodes_with_boxes: Vec<(WidgetNode, FigmaBoundingBox)>,
    ) -> Vec<WidgetNode> {
        if child_nodes_with_boxes.is_empty() {
            return Vec::new();
        }

        if child_nodes_with_boxes.len() == 1 {
            let (mut single_node, child_box) = child_nodes_with_boxes.into_iter().next().unwrap();
            let pad_left = (child_box.x - parent_box.x).max(0.0);
            let pad_top = (child_box.y - parent_box.y).max(0.0);

            if let Some(ref mut layout) = single_node.layout {
                layout.spacing.margin = RectOffsets {
                    top: pad_top,
                    left: pad_left,
                    bottom: 0.0,
                    right: 0.0,
                };
            }
            return vec![single_node];
        }

        let has_severe_2d_overlap = self.check_2d_collisions(&child_nodes_with_boxes);
        if has_severe_2d_overlap {
            return self.wrap_in_anchor_overlay(parent_box, child_nodes_with_boxes);
        }

        let bands = self.cluster_into_row_bands(child_nodes_with_boxes);
        let mut resolved_band_nodes = Vec::new();

        for band in bands {
            if band.len() == 1 {
                let (single_node, _) = band.into_iter().next().unwrap();
                resolved_band_nodes.push(single_node);
            } else {
                let mut sorted_band = band;
                sorted_band.sort_by(|a, b| {
                    a.1.x
                        .partial_cmp(&b.1.x)
                        .unwrap_or(std::cmp::Ordering::Equal)
                });

                let mut gaps = Vec::new();
                for i in 0..sorted_band.len().saturating_sub(1) {
                    let end_current = sorted_band[i].1.x + sorted_band[i].1.width;
                    let start_next = sorted_band[i + 1].1.x;
                    let gap = (start_next - end_current).max(0.0);
                    gaps.push(gap);
                }

                let avg_gap = if !gaps.is_empty() {
                    (gaps.iter().sum::<f64>() / gaps.len() as f64).round()
                } else {
                    8.0
                };

                let children: Vec<WidgetNode> =
                    sorted_band.into_iter().map(|(node, _)| node).collect();

                let row_wrapper = WidgetNode {
                    id: format!("hbox_{}", Uuid::new_v4().simple()),
                    widget_type: WidgetType::HBox,
                    slot: None,
                    properties: WidgetProperties::default(),
                    layout: Some(WidgetLayout {
                        container: Some(ContainerLayout::Flex(FlexContainer {
                            direction: FlexDirection::Row,
                            wrap: FlexWrap::NoWrap,
                            justify_content: JustifyContent::FlexStart,
                            align_items: AlignItems::Center,
                            gap: avg_gap,
                        })),
                        dimensions: Dimensions {
                            width: Size::Fill(1.0),
                            height: Size::HugContent,
                            min_width: None,
                            min_height: None,
                            max_width: None,
                            max_height: None,
                            aspect_ratio: None,
                        },
                        spacing: Spacing::default(),
                        absolute: None,
                        anchor: None,
                        border: None,
                        grid: None,
                        flex_item: None,
                    }),
                    events: Default::default(),
                    bindings: Default::default(),
                    animations: Vec::new(),
                    children,
                };

                resolved_band_nodes.push(row_wrapper);
            }
        }

        resolved_band_nodes
    }

    fn check_2d_collisions(
        &self,
        items: &[(WidgetNode, FigmaBoundingBox)],
    ) -> bool {
        for i in 0..items.len() {
            for j in (i + 1)..items.len() {
                let box_a = &items[i].1;
                let box_b = &items[j].1;

                let overlap_x = (box_a.x + box_a.width).min(box_b.x + box_b.width)
                    - box_a.x.max(box_b.x);
                let overlap_y = (box_a.y + box_a.height).min(box_b.y + box_b.height)
                    - box_a.y.max(box_b.y);

                if overlap_x > 8.0 && overlap_y > 8.0 {
                    let area_a = box_a.width * box_a.height;
                    let area_b = box_b.width * box_b.height;
                    let overlap_area = overlap_x * overlap_y;
                    let min_area = area_a.min(area_b);

                    if min_area > 0.0 && (overlap_area / min_area) > 0.45 {
                        return true;
                    }
                }
            }
        }
        false
    }

    fn cluster_into_row_bands(
        &self,
        mut items: Vec<(WidgetNode, FigmaBoundingBox)>,
    ) -> Vec<Vec<(WidgetNode, FigmaBoundingBox)>> {
        items.sort_by(|a, b| {
            a.1.y
                .partial_cmp(&b.1.y)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        let mut bands: Vec<Vec<(WidgetNode, FigmaBoundingBox)>> = Vec::new();

        for item in items {
            let mut matched_band_idx = None;

            for (idx, band) in bands.iter().enumerate() {
                let band_top = band.iter().map(|b| b.1.y).fold(f64::INFINITY, f64::min);
                let band_bottom = band
                    .iter()
                    .map(|b| b.1.y + b.1.height)
                    .fold(f64::NEG_INFINITY, f64::max);
                let band_height = (band_bottom - band_top).max(1.0);

                let item_top = item.1.y;
                let item_bottom = item.1.y + item.1.height;
                let item_height = item.1.height.max(1.0);

                let overlap_y = (band_bottom.min(item_bottom) - band_top.max(item_top)).max(0.0);
                let min_height = band_height.min(item_height);

                let center_band = band_top + band_height * 0.5;
                let center_item = item_top + item_height * 0.5;
                let center_delta = (center_band - center_item).abs();

                if (min_height > 0.0 && (overlap_y / min_height) >= 0.35)
                    || center_delta <= (min_height * 0.4).max(12.0)
                {
                    matched_band_idx = Some(idx);
                    break;
                }
            }

            if let Some(idx) = matched_band_idx {
                bands[idx].push(item);
            } else {
                bands.push(vec![item]);
            }
        }

        bands
    }

    fn wrap_in_anchor_overlay(
        &self,
        parent_box: &FigmaBoundingBox,
        items: Vec<(WidgetNode, FigmaBoundingBox)>,
    ) -> Vec<WidgetNode> {
        let mut overlay_children = Vec::new();

        for (mut node, bbox) in items {
            let left_offset = (bbox.x - parent_box.x).max(0.0);
            let top_offset = (bbox.y - parent_box.y).max(0.0);

            let anchor = AnchorConstraints {
                top: Some(top_offset.round()),
                left: Some(left_offset.round()),
                bottom: None,
                right: None,
            };

            let absolute = AbsolutePosition {
                x: left_offset.round(),
                y: top_offset.round(),
                z_index: 0,
            };

            if let Some(ref mut layout) = node.layout {
                layout.anchor = Some(anchor);
                layout.absolute = Some(absolute);
            } else {
                node.layout = Some(WidgetLayout {
                    container: None,
                    dimensions: Dimensions {
                        width: Size::Fixed(bbox.width.round()),
                        height: Size::Fixed(bbox.height.round()),
                        min_width: None,
                        min_height: None,
                        max_width: None,
                        max_height: None,
                        aspect_ratio: None,
                    },
                    spacing: Spacing::default(),
                    absolute: Some(absolute),
                    anchor: Some(anchor),
                    border: None,
                    grid: None,
                    flex_item: None,
                });
            }

            overlay_children.push(node);
        }

        let anchor_pane = WidgetNode {
            id: format!("anchor_pane_{}", Uuid::new_v4().simple()),
            widget_type: WidgetType::AnchorPane,
            slot: None,
            properties: WidgetProperties::default(),
            layout: Some(WidgetLayout {
                container: Some(ContainerLayout::Anchor),
                dimensions: Dimensions {
                    width: Size::Fixed(parent_box.width.round()),
                    height: Size::Fixed(parent_box.height.round()),
                    min_width: None,
                    min_height: None,
                    max_width: None,
                    max_height: None,
                    aspect_ratio: None,
                },
                spacing: Spacing::default(),
                absolute: None,
                anchor: None,
                border: None,
                grid: None,
                flex_item: None,
            }),
            events: Default::default(),
            bindings: Default::default(),
            animations: Vec::new(),
            children: overlay_children,
        };

        vec![anchor_pane]
    }

    fn map_primary_align(&self, val: &str) -> JustifyContent {
        match val {
            "CENTER" => JustifyContent::Center,
            "MAX" => JustifyContent::FlexEnd,
            "SPACE_BETWEEN" => JustifyContent::SpaceBetween,
            _ => JustifyContent::FlexStart,
        }
    }

    fn map_counter_align(&self, val: &str) -> AlignItems {
        match val {
            "CENTER" => AlignItems::Center,
            "MAX" => AlignItems::FlexEnd,
            "BASELINE" => AlignItems::Baseline,
            _ => AlignItems::FlexStart,
        }
    }
}

impl Default for GeometryResolver {
    fn default() -> Self {
        Self::new()
    }
}
