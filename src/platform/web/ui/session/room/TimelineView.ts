/*
Copyright 2020 Bruno Windels <bruno@windels.cloud>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import {ListView} from "../../general/ListView";
import {TemplateView, Builder} from "../../general/TemplateView";
import {IObservableValue} from "../../general/BaseUpdateView";
import {GapView} from "./timeline/GapView.js";
import {TextMessageView} from "./timeline/TextMessageView.js";
import {ImageView} from "./timeline/ImageView.js";
import {VideoView} from "./timeline/VideoView.js";
import {FileView} from "./timeline/FileView.js";
import {MissingAttachmentView} from "./timeline/MissingAttachmentView.js";
import {AnnouncementView} from "./timeline/AnnouncementView.js";
import {RedactedView} from "./timeline/RedactedView.js";
import {SimpleTile} from "../../../../../domain/session/room/timeline/tiles/SimpleTile.js";
import {BaseObservableList as ObservableList} from "../../../../../observable/list/BaseObservableList.js";

//import {TimelineViewModel} from "../../../../../domain/session/room/timeline/TimelineViewModel.js";
export interface TimelineViewModel extends IObservableValue {
    showJumpDown: boolean;
    tiles: ObservableList<SimpleTile>;
    setVisibleTileRange(start?: SimpleTile, end?: SimpleTile);
}

type TileView = GapView | AnnouncementView | TextMessageView |
    ImageView | VideoView | FileView | MissingAttachmentView | RedactedView;
type TileViewConstructor = (this: TileView, SimpleTile) => void;

export function viewClassForEntry(entry: SimpleTile): TileViewConstructor | undefined {
    switch (entry.shape) {
        case "gap": return GapView;
        case "announcement": return AnnouncementView;
        case "message":
        case "message-status":
            return TextMessageView;
        case "image": return ImageView;
        case "video": return VideoView;
        case "file": return FileView;
        case "missing-attachment": return MissingAttachmentView;
        case "redacted":
            return RedactedView;
    }
}

function bottom(node: HTMLElement): number {
    return node.offsetTop + node.clientHeight;
}

function findFirstNodeIndexAtOrBelow(tiles: HTMLElement, top: number, startIndex: number = (tiles.children.length - 1)): number {
    for (var i = startIndex; i >= 0; i--) {
        const node = tiles.children[i] as HTMLElement;
        if (node.offsetTop < top) {
            return i;
        }
    }
    // return first item if nothing matched before
    return 0;
}

export class TimelineView extends TemplateView<TimelineViewModel> {

    private anchoredNode?: HTMLElement;
    private anchoredBottom: number = 0;
    private stickToBottom: boolean = true;
    private tilesView?: TilesListView;
    private resizeObserver?: ResizeObserver;

    render(t: Builder<TimelineViewModel>, vm: TimelineViewModel) {
        // assume this view will be mounted in the parent DOM straight away
        requestAnimationFrame(() => {
            // do initial scroll positioning
            this.restoreScrollPosition();
        });
        this.tilesView = new TilesListView(vm.tiles, () => this.restoreScrollPosition());
        const root = t.div({className: "Timeline"}, [
            t.div({
                className: "Timeline_scroller bottom-aligned-scroll",
                onScroll: () => this.onScroll()
            }, t.view(this.tilesView)),
            t.button({
                className: {
                    "Timeline_jumpDown": true,
                    hidden: vm => !vm.showJumpDown
                },
                title: "Jump down",
                onClick: () => this.jumpDown()
            })
        ]);

        if (typeof ResizeObserver === "function") {
            this.resizeObserver = new ResizeObserver(() => {
                this.restoreScrollPosition();
            });
            this.resizeObserver.observe(root);
        }

        return root;
    }

    private get scrollNode(): HTMLElement {
        return (this.root()! as HTMLElement).firstElementChild! as HTMLElement;
    }

    private get tilesNode(): HTMLElement {
        return this.tilesView!.root()! as HTMLElement;
    }

    private jumpDown() {
        const {scrollNode} = this;
        this.stickToBottom = true;
        scrollNode.scrollTop = scrollNode.scrollHeight;
    }

    public unmount() {
        super.unmount();
        if (this.resizeObserver) {
            this.resizeObserver.unobserve(this.root()! as Element);
            this.resizeObserver = undefined;
        }
    }

    private restoreScrollPosition() {
        const {scrollNode, tilesNode} = this;

        const missingTilesHeight = scrollNode.clientHeight - tilesNode.clientHeight;
        if (missingTilesHeight > 0) {
            tilesNode.style.setProperty("margin-top", `${missingTilesHeight}px`);
            // we don't have enough tiles to fill the viewport, so set all as visible
            const len = this.value.tiles.length;
            this.updateVisibleRange(0, len - 1);
        } else {
            tilesNode.style.removeProperty("margin-top");
            if (this.stickToBottom) {
                scrollNode.scrollTop = scrollNode.scrollHeight;
            } else if (this.anchoredNode) {
                const newAnchoredBottom = bottom(this.anchoredNode!);
                if (newAnchoredBottom !== this.anchoredBottom) {
                    const bottomDiff = newAnchoredBottom - this.anchoredBottom;
                    // scrollBy tends to create less scroll jumps than reassigning scrollTop as it does
                    // not depend on reading scrollTop, which might be out of date as some platforms
                    // run scrolling off the main thread.
                    if (typeof scrollNode.scrollBy === "function") {
                        scrollNode.scrollBy(0, bottomDiff);
                    } else {
                        scrollNode.scrollTop = scrollNode.scrollTop + bottomDiff;
                    }
                    this.anchoredBottom = newAnchoredBottom;
                }
            }
            // TODO: should we be updating the visible range here as well as the range might have changed even though
            // we restored the bottom tile
        }
    }

    private onScroll(): void {
        const {scrollNode, tilesNode} = this;
        const {scrollHeight, scrollTop, clientHeight} = scrollNode;

        let bottomNodeIndex;
        this.stickToBottom = Math.abs(scrollHeight - (scrollTop + clientHeight)) < 1;
        if (this.stickToBottom) {
            const len = this.value.tiles.length;
            bottomNodeIndex = len - 1;
        } else {
            const viewportBottom = scrollTop + clientHeight;
            const anchoredNodeIndex = findFirstNodeIndexAtOrBelow(tilesNode, viewportBottom);
            this.anchoredNode = tilesNode.childNodes[anchoredNodeIndex] as HTMLElement;
            this.anchoredBottom = bottom(this.anchoredNode!);
            bottomNodeIndex = anchoredNodeIndex;
        }
        let topNodeIndex = findFirstNodeIndexAtOrBelow(tilesNode, scrollTop, bottomNodeIndex);
        this.updateVisibleRange(topNodeIndex, bottomNodeIndex);
    }

    private updateVisibleRange(startIndex: number, endIndex: number) {
        // can be undefined, meaning the tiles collection is still empty
        const firstVisibleChild = this.tilesView!.getChildInstanceByIndex(startIndex);
        const lastVisibleChild = this.tilesView!.getChildInstanceByIndex(endIndex);
        this.value.setVisibleTileRange(firstVisibleChild?.value, lastVisibleChild?.value);
    }
}

class TilesListView extends ListView<SimpleTile, TileView> {

    private onChanged: () => void;

    constructor(tiles: ObservableList<SimpleTile>, onChanged: () => void) {
        const options = {
            list: tiles,
            onItemClick: (tileView, evt) => tileView.onClick(evt),
        };
        super(options, entry => {
            const View = viewClassForEntry(entry);
            if (View) {
                return new View(entry);
            }
        });
        this.onChanged = onChanged;
    }

    protected onUpdate(index: number, value: SimpleTile, param: any) {
        if (param === "shape") {
            const ExpectedClass = viewClassForEntry(value);
            const child = this.getChildInstanceByIndex(index);
            if (!ExpectedClass || !(child instanceof ExpectedClass)) {
                // shape was updated, so we need to recreate the tile view,
                // the shape parameter is set in EncryptedEventTile.updateEntry
                // (and perhaps elsewhere by the time you read this)
                super.recreateItem(index, value);
                return;
            }
        }
        super.onUpdate(index, value, param);
        this.onChanged();
    }

    protected onAdd(idx: number, value: SimpleTile) {
        super.onAdd(idx, value);
        this.onChanged();
    }

    protected onRemove(idx: number, value: SimpleTile) {
        super.onRemove(idx, value);
        this.onChanged();
    }

    protected onMove(fromIdx: number, toIdx: number, value: SimpleTile) {
        super.onMove(fromIdx, toIdx, value);
        this.onChanged();
    }
}
