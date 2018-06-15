/*tslint:disable:no-any*/

import * as Mousetrap from 'mousetrap';

import {createClientPromise, exportClientFunction, ServiceClient, ServiceIdentity} from './util';

const VERSION = '0.0.1';

declare var fin: any;
if (typeof fin === 'undefined') {
  throw new Error(
      'fin is not defined, This module is only intended for use in an OpenFin application.');
}

const getId = (() => {
  let id: ServiceIdentity;
  return () => {
    if (id) {
      return id;
    }
    const {uuid, name} = fin.desktop.Window.getCurrent();
    id = {uuid, name};
    return id;
  };
})();

const clientP = createClientPromise(
    {uuid: 'Layouts-Manager', name: 'Layouts-Manager'}, VERSION);



clientP.then((client: any) => {
  Mousetrap.bind('mod+shift+l', async () => {
    const layout = await client.dispatch('setLayout');
    console.log('Layout set', layout);
  });
});

export const setLayout = exportClientFunction(
                          clientP,
                          (client: ServiceClient) =>
                              async () => {
                                const layout = await client.dispatch('setLayout');
                                console.log('Layout set', layout);
                              }) as (identity?: ServiceIdentity) =>
                          Promise<void>;

export const getLayout =
    exportClientFunction(
        clientP,
        (client: ServiceClient) =>
            async (identity: ServiceIdentity = getId()) => {
              await client.dispatch('deregister', identity);
            }) as (identity?: ServiceIdentity) => Promise<void>;
