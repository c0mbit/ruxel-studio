import { FC, useState } from "react";
import { useEditorStore } from "../state/editorStore";
import { usePresetStore } from "../state/presetStore";
import { useCrdtStore } from "../state/crdtStore";
import { findNodeById } from "../utils/treeTraversal";
import { getWidgetTypeLabel } from "../utils/widgetFactory";

export const SavePresetModal: FC = () => {
    const isSavePresetModalOpen = usePresetStore(
        (state) => state.isSavePresetModalOpen
    );
    const setIsSavePresetModalOpen = usePresetStore(
        (state) => state.setIsSavePresetModalOpen
    );
    const savePreset = usePresetStore((state) => state.savePreset);
    const isLoading = usePresetStore((state) => state.isLoading);

    const document = useEditorStore((state) => state.document);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const userName = useCrdtStore((state) => state.userName);

    const selectedNode =
        document && selectedNodeId
            ? findNodeById(document.root, selectedNodeId)
            : null;

    const [name, setName] = useState(
        selectedNode
            ? `${getWidgetTypeLabel(selectedNode.widget_type)} Component`
            : "Team Component"
    );
    const [category, setCategory] = useState("Cards");
    const [description, setDescription] = useState(
        "Reusable team preset component"
    );
    const [tags, setTags] = useState("team, custom, ui");

    if (!isSavePresetModalOpen || !selectedNode) {
        return null;
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const tagList = tags
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0);

        await savePreset({
            name,
            category,
            description,
            author: userName || "Team Member",
            rootNode: selectedNode,
            tags: tagList,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none">
            <div className="w-[460px] rounded-lg bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
                <header className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">☁️</span>
                        <div>
                            <h2 className="text-sm font-semibold text-zinc-100">
                                Save as Team Preset
                            </h2>
                            <p className="text-xs text-zinc-400">
                                Share widget sub-tree to team cloud library
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsSavePresetModalOpen(false)}
                        className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition-colors"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </header>

                <form onSubmit={handleSave} className="p-5 space-y-3.5 text-xs">
                    <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                        <div>
                            <span className="text-zinc-400">Target Widget: </span>
                            <span className="font-mono text-zinc-200 font-semibold">
                                {selectedNode.id}
                            </span>
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                            {getWidgetTypeLabel(selectedNode.widget_type)}
                        </span>
                    </div>

                    <div>
                        <label className="block text-zinc-300 font-medium mb-1">
                            Preset Name
                        </label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full h-8 px-2.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-200 outline-none focus:border-blue-500"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-zinc-300 font-medium mb-1">
                                Category
                            </label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full h-8 px-2 rounded bg-zinc-950 border border-zinc-700 text-zinc-200 outline-none focus:border-blue-500"
                            >
                                <option value="Cards">Cards</option>
                                <option value="Headers">Headers</option>
                                <option value="Forms">Forms</option>
                                <option value="Navigation">Navigation</option>
                                <option value="General">General</option>
                                <option value="Custom">Custom</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-zinc-300 font-medium mb-1">
                                Tags (comma separated)
                            </label>
                            <input
                                type="text"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                className="w-full h-8 px-2.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-200 outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-zinc-300 font-medium mb-1">
                            Description
                        </label>
                        <textarea
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full p-2 rounded bg-zinc-950 border border-zinc-700 text-zinc-200 outline-none focus:border-blue-500 resize-none"
                        />
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setIsSavePresetModalOpen(false)}
                            className="px-3 h-8 rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-4 h-8 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
                        >
                            {isLoading ? "Saving..." : "Save to Cloud Library"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

