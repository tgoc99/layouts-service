/**
 * @hidden
 */

/**
 * File contains vars used to establish service connection between client and provider.
 *
 * These are separated out from 'internal.ts' as including these from provider code will cause the provider to connect
 * to itself.
 *
 * These types are a part of the client, but are not required by applications wishing to interact with the service.
 * This file is excluded from the public-facing TypeScript documentation.
 */
import {EventEmitter} from 'events';

import {ChannelClient} from 'hadouken-js-adapter/out/types/src/api/interappbus/channel/client';

import {SnapAndDockEvent} from '../client/snapanddock';
import {TabbingEvent} from '../client/tabbing';
import {TabstripEvent} from '../client/tabstrip';
import {WorkspacesEvent} from '../client/workspaces';

import {APITopic, SERVICE_CHANNEL} from './internal';

/**
 * The version of the NPM package.
 *
 * Webpack replaces any instances of this constant with a hard-coded string at build time.
 */
declare const PACKAGE_VERSION: string;
const LAYOUTS_UUID = 'layouts-service';
const layoutsAppOptions = {
    uuid: LAYOUTS_UUID,
    name: LAYOUTS_UUID,
    url: 'http://localhost:1337/provider/provider.html', //'https://cdn.openfin.co/services/openfin/layouts/1.0.5/provider.html',
    autoShow: true,
    nonPersistent: true
}

/**
 * Defines all events that are fired by the service
 */
export type LayoutsEvent = TabstripEvent|TabbingEvent|WorkspacesEvent|SnapAndDockEvent;

/**
 * The event emitter to emit events received from the service.  All addEventListeners will tap into this.
 */
export const eventEmitter = new EventEmitter();

/**
 * Promise to the channel object that allows us to connect to the client
 */
let channelPromise: Promise<ChannelClient>|null = null;
let serviceRunning: boolean|null = null;

if (typeof fin !== 'undefined') {
    getServicePromise();
}

export function getServicePromise(): Promise<ChannelClient> {
    if (typeof fin === 'undefined') {
        throw new Error('fin is not defined. The openfin-layouts module is only intended for use in an OpenFin application.')
    }
    if(!serviceRunning) {
        fin.Application.wrapSync({uuid: LAYOUTS_UUID}).isRunning().then(isRunning => {
            if (!isRunning) {
                // START LAYOUTS APP PROGRAMMATICALLY
                console.log('not running, launching');
                // need to use create to make backward compatible
                fin.Application.create(layoutsAppOptions).then(a => {
                    a.run().then(() => {
                        console.log('launched programmatically');
                        serviceRunning = true;
                    }).catch(console.error);
                }).catch(console.error);
            } else {
                serviceRunning = true;
            }
        })
    }
    if (!channelPromise) {
        channelPromise = fin.InterApplicationBus.Channel.connect(SERVICE_CHANNEL, {payload: {version: PACKAGE_VERSION}})
            .then((channel: ChannelClient) => {
                // Register service listeners
                channel.register('WARN', (payload: any) => console.warn(payload));  // tslint:disable-line:no-any
                channel.register('event', (event: LayoutsEvent) => {
                    eventEmitter.emit(event.type, event);
                });
                // Any unregistered action will simply return false
                channel.setDefaultAction(() => false);

                return channel;
            });
    }

    return channelPromise;
}

/**
 * Wrapper around service.dispatch to help with type checking
 */
export async function tryServiceDispatch<T, R>(action: APITopic, payload?: T): Promise<R> {
    const channel: ChannelClient = await getServicePromise();
    return channel.dispatch(action, payload) as Promise<R>;
}
