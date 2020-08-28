import "@material/mwc-button/mwc-button";
import "@material/mwc-fab/mwc-fab";
import "@material/mwc-list/mwc-list";
import "@material/mwc-list/mwc-list-item";
import { mdiArrowLeft, mdiFolder, mdiPlay, mdiPlus } from "@mdi/js";
import "@polymer/paper-item/paper-item";
import "@polymer/paper-listbox/paper-listbox";
import {
  css,
  CSSResultArray,
  customElement,
  html,
  internalProperty,
  LitElement,
  property,
  PropertyValues,
  TemplateResult,
} from "lit-element";
import { classMap } from "lit-html/directives/class-map";
import { ifDefined } from "lit-html/directives/if-defined";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../common/dom/fire_event";
import { debounce } from "../../common/util/debounce";
import { browseMediaPlayer, MediaPickedEvent } from "../../data/media-player";
import type { MediaPlayerItem } from "../../data/media-player";
import { installResizeObserver } from "../../panels/lovelace/common/install-resize-observer";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "../entity/ha-entity-picker";
import "../ha-button-menu";
import "../ha-card";
import "../ha-circular-progress";
import "../ha-paper-dropdown-menu";
import "../ha-svg-icon";

declare global {
  interface HASSDomEvents {
    "media-picked": MediaPickedEvent;
    "media-browser-navigated": MediaBrowserNavigatedEvent;
  }
}

export interface MediaBrowserNavigatedEvent {
  root: boolean;
  title?: string;
}

@customElement("ha-media-player-browse")
export class HaMediaPlayerBrowse extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public entityId!: string;

  @property() public mediaContentId?: string;

  @property() public mediaContentType?: string;

  @property() public action: "pick" | "play" = "play";

  @property({ type: Boolean }) public hideBack = false;

  @property({ type: Boolean, attribute: "narrow", reflect: true })
  private _narrow = false;

  @internalProperty() private _loading = false;

  @internalProperty() private _mediaPlayerItems: MediaPlayerItem[] = [];

  private _resizeObserver?: ResizeObserver;

  public connectedCallback(): void {
    super.connectedCallback();
    this.updateComplete.then(() => this._attachObserver());
  }

  public disconnectedCallback(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
  }

  public navigateBack() {
    this._mediaPlayerItems!.pop();
    const item = this._mediaPlayerItems!.pop();
    if (!item) {
      return;
    }
    this._navigate(item);
  }

  protected render(): TemplateResult {
    if (!this._mediaPlayerItems.length) {
      return html``;
    }

    if (this._loading) {
      return html`<ha-circular-progress active></ha-circular-progress>`;
    }

    const mostRecentItem = this._mediaPlayerItems[
      this._mediaPlayerItems.length - 1
    ];
    const previousItem =
      this._mediaPlayerItems.length > 1
        ? this._mediaPlayerItems[this._mediaPlayerItems.length - 2]
        : undefined;

    const hasExpandableChildren:
      | MediaPlayerItem
      | undefined = this._hasExpandableChildren(mostRecentItem.children);

    const showImages = mostRecentItem.children?.some(
      (child) => child.thumbnail && child.thumbnail !== mostRecentItem.thumbnail
    );

    return html`
      <div class="header">
        <div class="header-content">
          ${mostRecentItem.thumbnail
            ? html`
                <div
                  class="img"
                  style="background-image: url(${mostRecentItem.thumbnail})"
                >
                  ${this._narrow && mostRecentItem?.can_play
                    ? html`
                        <mwc-fab
                          mini
                          .item=${mostRecentItem}
                          @click=${this._actionClicked}
                        >
                          <ha-svg-icon
                            slot="icon"
                            .label=${this.hass.localize(
                              `ui.components.media-browser.${this.action}-media`
                            )}
                            .path=${this.action === "play" ? mdiPlay : mdiPlus}
                          ></ha-svg-icon>
                          ${this.hass.localize(
                            `ui.components.media-browser.${this.action}`
                          )}
                        </mwc-fab>
                      `
                    : ""}
                </div>
              `
            : html``}
          <div class="header-info">
            ${!this.hideBack || mostRecentItem.thumbnail
              ? html`<div class="breadcrumb-overflow">
                  <div class="breadcrumb">
                    ${!this.hideBack && previousItem
                      ? html`
                          <div
                            class="previous-title"
                            @click=${this.navigateBack}
                          >
                            <ha-svg-icon .path=${mdiArrowLeft}></ha-svg-icon>
                            ${previousItem.title}
                          </div>
                        `
                      : ""}
                    <h1 class="title">${mostRecentItem.title}</h1>
                    <h2 class="subtitle">
                      ${this.hass.localize(
                        `ui.components.media-browser.content-type.${mostRecentItem.media_content_type}`
                      )}
                    </h2>
                  </div>
                </div>`
              : ""}
            ${mostRecentItem?.can_play &&
            (!this._narrow || (this._narrow && !mostRecentItem.thumbnail))
              ? html`
                  <div>
                    <mwc-button
                      raised
                      .item=${mostRecentItem}
                      @click=${this._actionClicked}
                    >
                      <ha-svg-icon
                        slot="icon"
                        .label=${this.hass.localize(
                          `ui.components.media-browser.${this.action}-media`
                        )}
                        .path=${this.action === "play" ? mdiPlay : mdiPlus}
                      ></ha-svg-icon>
                      ${this.hass.localize(
                        `ui.components.media-browser.${this.action}`
                      )}
                    </mwc-button>
                  </div>
                `
              : ""}
          </div>
        </div>
      </div>
      ${!this.hideBack || mostRecentItem.thumbnail || mostRecentItem.can_play
        ? html`<div class="divider"></div>`
        : ""}
      ${mostRecentItem.children?.length
        ? hasExpandableChildren
          ? html`
              <div class="children">
                ${mostRecentItem.children?.length
                  ? html`
                      ${mostRecentItem.children.map(
                        (child) => html`
                          <div
                            class="child"
                            .item=${child}
                            @click=${this._navigateForward}
                          >
                            <div class="ha-card-parent">
                              <ha-card
                                outlined
                                style="background-image: url(${child.thumbnail})"
                              >
                                ${child.can_expand && !child.thumbnail
                                  ? html`
                                      <ha-svg-icon
                                        class="folder"
                                        .path=${mdiFolder}
                                      ></ha-svg-icon>
                                    `
                                  : ""}
                              </ha-card>
                              ${child.can_play
                                ? html`
                                    <mwc-icon-button
                                      class="play"
                                      .item=${child}
                                      .label=${this.hass.localize(
                                        `ui.components.media-browser.${this.action}-media`
                                      )}
                                      @click=${this._actionClicked}
                                    >
                                      <ha-svg-icon
                                        .path=${this.action === "play"
                                          ? mdiPlay
                                          : mdiPlus}
                                      ></ha-svg-icon>
                                    </mwc-icon-button>
                                  `
                                : ""}
                            </div>
                            <div class="title">${child.title}</div>
                            <div class="type">
                              ${this.hass.localize(
                                `ui.components.media-browser.content-type.${child.media_content_type}`
                              )}
                            </div>
                          </div>
                        `
                      )}
                    `
                  : ""}
              </div>
            `
          : html`
              <mwc-list>
                ${mostRecentItem.children.map(
                  (child) => html`
                    <mwc-list-item
                      @click=${this._actionClicked}
                      .item=${child}
                      graphic="avatar"
                      hasMeta
                    >
                      <div
                        class="graphic"
                        style=${ifDefined(
                          showImages && child.thumbnail
                            ? `background-image: url(${child.thumbnail})`
                            : undefined
                        )}
                        slot="graphic"
                      >
                        <mwc-icon-button
                          class="play ${classMap({
                            show: !showImages || !child.thumbnail,
                          })}"
                          .item=${child}
                          .label=${this.hass.localize(
                            `ui.components.media-browser.${this.action}-media`
                          )}
                          @click=${this._actionClicked}
                        >
                          <ha-svg-icon
                            .path=${this.action === "play" ? mdiPlay : mdiPlus}
                          ></ha-svg-icon>
                        </mwc-icon-button>
                      </div>
                      <span>${child.title}</span>
                    </mwc-list-item>
                    <li divider role="separator"></li>
                  `
                )}
              </mwc-list>
            `
        : this.hass.localize("ui.components.media-browser.no_items")}
    `;
  }

  protected firstUpdated(): void {
    this._measureCard();
    this._attachObserver();
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);

    if (
      !changedProps.has("entityId") &&
      !changedProps.has("mediaContentId") &&
      !changedProps.has("mediaContentType") &&
      !changedProps.has("action")
    ) {
      return;
    }

    this._fetchData(this.mediaContentId, this.mediaContentType).then(
      (itemData) => {
        this._mediaPlayerItems = [itemData];
      }
    );
  }

  private _actionClicked(ev: MouseEvent): void {
    ev.stopPropagation();
    const item = (ev.currentTarget as any).item;

    this._runAction(item);
  }

  private _runAction(item: MediaPlayerItem): void {
    fireEvent(this, "media-picked", {
      media_content_id: item.media_content_id,
      media_content_type: item.media_content_type,
    });
  }

  private async _navigateForward(ev: MouseEvent): Promise<void> {
    const target = ev.currentTarget as any;
    const item: MediaPlayerItem = target.item;

    if (!item) {
      return;
    }
    this._navigate(item);
  }

  private async _navigate(item: MediaPlayerItem) {
    const itemData = await this._fetchData(
      item.media_content_id,
      item.media_content_type
    );
    fireEvent(this, "media-browser-navigated", {
      root: this._mediaPlayerItems.length === 0,
      title: itemData.title,
    });
    this._mediaPlayerItems = [...this._mediaPlayerItems, itemData];
  }

  private async _fetchData(
    mediaContentId?: string,
    mediaContentType?: string
  ): Promise<MediaPlayerItem> {
    const itemData = await browseMediaPlayer(
      this.hass,
      this.entityId,
      !mediaContentId ? undefined : mediaContentId,
      mediaContentType
    );

    return itemData;
  }

  private _measureCard(): void {
    this._narrow = this.offsetWidth < 500;
  }

  private async _attachObserver(): Promise<void> {
    if (!this._resizeObserver) {
      await installResizeObserver();
      this._resizeObserver = new ResizeObserver(
        debounce(() => this._measureCard(), 250, false)
      );
    }

    this._resizeObserver.observe(this);
  }

  private _hasExpandableChildren = memoizeOne((children) =>
    children.find((item: MediaPlayerItem) => item.can_expand)
  );

  static get styles(): CSSResultArray {
    return [
      haStyle,
      css`
        :host {
          display: block;
        }

        .header {
          display: flex;
          justify-content: space-between;
        }

        .breadcrumb-overflow {
          display: flex;
          justify-content: space-between;
        }

        .header-content {
          display: flex;
          flex-wrap: wrap;
          flex-grow: 1;
          align-items: flex-start;
        }

        .header-content .img {
          height: 200px;
          width: 200px;
          margin-right: 16px;
          background-size: cover;
        }

        .header-info {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-self: stretch;
          min-width: 0;
          flex: 1;
        }

        .breadcrumb {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex-grow: 1;
        }

        .breadcrumb .title {
          font-size: 32px;
          line-height: 1.2;
          font-weight: bold;
          margin: 0;
          overflow: hidden;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .breadcrumb .previous-title {
          font-size: 14px;
          padding-bottom: 8px;
          color: var(--secondary-text-color);
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: pointer;
          --mdc-icon-size: 14px;
        }

        .breadcrumb .subtitle {
          font-size: 16px;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 0;
        }

        .divider {
          padding: 10px 0;
        }

        .divider::before {
          height: 1px;
          display: block;
          background-color: var(--divider-color);
          content: " ";
        }

        /* ============= CHILDREN ============= */

        mwc-list {
          --mdc-list-vertical-padding: 0;
          --mdc-theme-text-icon-on-background: var(--secondary-text-color);
          border: 1px solid var(--divider-color);
          border-radius: 4px;
        }

        mwc-list li:last-child {
          display: none;
        }

        mwc-list li[divider] {
          border-bottom-color: var(--divider-color);
        }

        .children {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(var(--media-browse-item-size, 175px), 0.33fr)
          );
          grid-gap: 16px;
          margin: 8px 0px;
        }

        .child {
          display: flex;
          flex-direction: column;
          cursor: pointer;
        }

        .ha-card-parent {
          position: relative;
          width: 100%;
        }

        ha-card {
          width: 100%;
          padding-bottom: 100%;
          position: relative;
          box-sizing: border-box;
          background-size: cover;
          background-repeat: no-repeat;
          background-position: center;
        }

        .child .folder,
        .child .play {
          position: absolute;
        }

        .child .folder {
          color: var(--secondary-text-color);
          top: calc(50% - (var(--mdc-icon-size) / 2));
          left: calc(50% - (var(--mdc-icon-size) / 2));
          --mdc-icon-size: calc(var(--media-browse-item-size, 175px) * 0.4);
        }

        .child .play {
          bottom: 4px;
          right: 4px;
          transition: all 0.5s;
          background-color: rgba(var(--rgb-card-background-color), 0.5);
          border-radius: 50%;
        }

        .child .play:hover {
          color: var(--primary-color);
        }

        ha-card:hover {
          opacity: 0.5;
        }

        .child .title {
          font-size: 16px;
          padding-top: 8px;
          overflow: hidden;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .child .type {
          font-size: 12px;
          color: var(--secondary-text-color);
        }

        mwc-list-item .graphic {
          background-size: cover;
        }

        mwc-list-item .graphic .play {
          opacity: 0;
          transition: all 0.5s;
          background-color: rgba(var(--rgb-card-background-color), 0.5);
          border-radius: 50%;
          --mdc-icon-button-size: 40px;
        }

        mwc-list-item:hover .graphic .play {
          opacity: 1;
          color: var(--primary-color);
        }

        mwc-list-item .graphic .play.show {
          opacity: 1;
          background-color: transparent;
        }

        /* ============= Narrow ============= */

        :host([narrow]) {
          padding: 0;
        }

        :host([narrow]) mwc-list {
          border: 0;
        }

        :host([narrow]) .breadcrumb .title {
          font-size: 38px;
        }

        :host([narrow]) .breadcrumb-overflow {
          align-items: flex-end;
        }

        :host([narrow]) .header-content {
          flex-direction: column;
          flex-wrap: nowrap;
        }

        :host([narrow]) .header-content .img {
          height: auto;
          width: 100%;
          margin-right: 0;
          padding-bottom: 100%;
          margin-bottom: 8px;
          position: relative;
        }

        :host([narrow]) .header-content .img mwc-fab {
          position: absolute;
          --mdc-theme-secondary: var(--primary-color);
          bottom: -20px;
          right: 20px;
        }

        :host([narrow]) .header-info,
        :host([narrow]) .media-source,
        :host([narrow]) .children {
          padding: 0 24px;
        }

        :host([narrow]) .children {
          grid-template-columns: 1fr 1fr !important;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-media-player-browse": HaMediaPlayerBrowse;
  }
}
