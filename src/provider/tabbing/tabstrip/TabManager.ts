import Sortable from 'sortablejs';

import {TabApiEvents} from '../../../client/APITypes';
import {TabbingApi} from '../../../client/TabbingApi';
import {TabIdentifier, TabPackage, TabProperties} from '../../../client/types';

import {Tab} from './TabItem';

/**
 * Handles the management of tabs and some of their functionality.
 */
export class TabManager {
    /**
     *  The HTML Element container for the tabs.
     */
    public static tabContainer: HTMLElement = document.getElementById('tabs')!;

    /**
     * Handle to the Tabbing API
     */
    public static tabAPI: TabbingApi = new TabbingApi();

    /**
     * An array of the tabs present in the window.
     */
    private tabs: Tab[] = [];

    /**
     * The currently active tab (highlighted).
     */
    private activeTab!: Tab;

    /**
     * The last active tab before the current active tab.
     */
    private lastActiveTab!: Tab|null;

    private dragDropManager: Sortable;

    /**
     * Constructs the TabManager class.
     */
    constructor() {
        TabManager.tabContainer = document.getElementById('tabs')!;
        this._setupListeners();

        this.dragDropManager = Sortable.create(TabManager.tabContainer, {
            sort: true,
            animation: 200,
            onUpdate: (evt) => {
                // Gets the new tab order as an array of TabIdentifiers
                const tabNodes = ((document.getElementById('tabs') as HTMLDivElement).getElementsByClassName('tab') as NodeListOf<HTMLDivElement>);
                const orderedTabList: TabIdentifier[] = Array.from(tabNodes).map((el) => {
                    return {uuid: el.dataset.uuid as string, name: el.dataset.name as string};
                });
                // Sends the new order to the service to update the cache
                TabManager.tabAPI.sendTabOrder(orderedTabList);
            }
        });
    }

    /**
     * Creates a new Tab and renders.
     * @param {TabIdentifier} tabID An object containing the uuid, name for the external application/window.
     * @param {tabProps} tabProps An object containing Tab Properties (icon, title,etc)
     */
    public async addTab(tabID: TabIdentifier, tabProps: TabProperties, index: number) {
        if (this._getTabIndex(tabID) === -1) {
            const tab = new Tab(tabID, tabProps, this);
            await tab.init(index);

            if (index > this.tabs.length) {
                this.tabs.push(tab);
            } else {
                this.tabs.splice(index, 0, tab);
            }
        }
    }

    /**
     * Removes a Tab.
     * @param {TabIdentifier} tabID An object containing the uuid, name for the external application/window.
     */
    public removeTab(tabID: TabIdentifier, closeApp = false): void {
        const index: number = this._getTabIndex(tabID);
        const tab: Tab|undefined = this.getTab(tabID);

        // if tab was found
        if (tab && index !== -1) {
            tab.remove();
            this.tabs.splice(index, 1);
        }
    }

    /**
     * Unsets the active tab
     * @method unsetActiveTab Removes the active status from the current active Tab.
     */
    public unsetActiveTab(): void {
        if (!this.activeTab) {
            return;
        }

        this.activeTab.unsetActive();
    }

    /**
     * Sets a specified tab as active.  If no tab is specified then the first tab will be chosen.
     * @param {TabIdentifier | null} tabID An object containing the uuid, name for the external application/window or null.
     */
    public setActiveTab(tabID: TabIdentifier|null = null): void {
        if (tabID) {
            const tab: Tab|undefined = this.getTab(tabID);

            if (tab) {
                if (tab !== this.activeTab) {
                    this.lastActiveTab = this.activeTab;
                    this.unsetActiveTab();
                    tab.setActive();
                    this.activeTab = tab;
                }
            }
        }
    }

    /**
     * Finds and gets the Tab object.
     * @param {TabIdentifier} tabID An object containing the uuid, name for the external application/window.
     */
    public getTab(tabID: TabIdentifier): Tab|undefined {
        return this.tabs.find((tab: Tab) => {
            return tab.ID.name === tabID.name && tab.ID.uuid === tabID.uuid;
        });
    }

    /**
     * Creates listeners for various IAB + Window Events.
     */
    private _setupListeners(): void {
        TabManager.tabAPI.addEventListener(TabApiEvents.TABADDED, (tabInfo: TabPackage) => {
            console.log('TABADDED', tabInfo);
            this.addTab(tabInfo.tabID, tabInfo.tabProps!, tabInfo.index!);
        });

        TabManager.tabAPI.addEventListener(TabApiEvents.TABREMOVED, (tabInfo: TabIdentifier) => {
            console.log('TABREMOVED', tabInfo);
            this.removeTab(tabInfo);
        });

        TabManager.tabAPI.addEventListener(TabApiEvents.TABACTIVATED, (tabInfo: TabIdentifier) => {
            console.log('TABACTIVATED', tabInfo);
            this.setActiveTab(tabInfo);
        });

        TabManager.tabAPI.addEventListener(TabApiEvents.PROPERTIESUPDATED, (tabInfo: TabPackage) => {
            console.log('TABPROPERTIESUPDATED', tabInfo);
            const tab = this.getTab(tabInfo.tabID);
            if (tab && tabInfo.tabProps) {
                if (tabInfo.tabProps.icon) {
                    tab.updateIcon(tabInfo.tabProps.icon);
                }

                if (tabInfo.tabProps.title) {
                    tab.updateText(tabInfo.tabProps.title);
                }
            }
        });
    }

    /**
     * Gets the Tab index from the array.
     * @param {TabIdentifier} tabID An object containing the uuid, name for the external application/window.
     */
    private _getTabIndex(tabID: TabIdentifier): number {
        return this.tabs.findIndex((tab: Tab) => {
            return tab.ID.name === tabID.name && tab.ID.uuid === tabID.uuid;
        });
    }

    /**
     * Returns an array of all the tabs.
     * @returns {Tab[]}
     */
    public get getTabs(): Tab[] {
        return this.tabs;
    }

    /**
     * Returns the last active tab.
     * @returns {Tab | null} Last Active Tab
     */
    public get getLastActiveTab(): Tab|null {
        return this.lastActiveTab;
    }

    /**
     * Returns the active tab.
     * @returns {Tab} Active Tab
     */
    public get getActiveTab(): Tab {
        return this.activeTab;
    }
}