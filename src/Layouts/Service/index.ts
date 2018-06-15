/*tslint:disable:no-any*/
import { promiseMap } from '../../SnapAndDock/Service/utils/async';
import { Layout, LayoutApp, LayoutName, Url, WindowState } from '../types';
import { Identity } from 'hadouken-js-adapter/out/types/src/identity';
import { Provider } from 'hadouken-js-adapter/out/types/src/api/services/provider';
import { Window } from 'hadouken-js-adapter';

declare var fin: any;
declare var window: {
  localStorage: any;
  providerChannel: Provider;
};

// STORAGE - TODO: customizable via service
class Storage {
  protected storage: any;
  constructor(externalStorage?: any) {
    if (externalStorage) {
        this.storage = externalStorage;
    } else if (window.localStorage) {
      this.storage = window.localStorage;
    }
  }

  get(key: string) {
    return this.storage.getItem(key);
  }

  set(key: string, value: any) {
    this.storage.setItem(key, value);
  }
}

const layouts = new Storage();
let layoutId = 1;
let providerChannel:Provider;

const getCurrentLayout = async (): Promise<Layout> => {
  const apps = await fin.System.getAllWindows();
  const layoutApps = await promiseMap(apps, async (app:LayoutApp) => {
    const { uuid } = app;
    let parentUuid;
    const ofApp = await fin.Application.wrap({uuid});
    const mainWindowInfo  = await ofApp.getWindow().then((win: Window) => win.getInfo());
    // eventually use manifestUrl instead once API call exists
    const manifest = await ofApp.getManifest().catch(async () => {
      // not launched from manifest - get parent UUID and main Window info 
      parentUuid = await ofApp.getParentUuid().catch(() => false);
      return false;
    });
    const mainWindowGroup = await getGroup({ uuid, name: uuid });

    app.mainWindow = { ...app.mainWindow, windowGroup: mainWindowGroup, info: mainWindowInfo, uuid, contextGroup:[] };
    app.childWindows = await promiseMap(app.childWindows, async (win:WindowState) => {
      const { name } = win;
      const windowGroup = await getGroup({ uuid, name });
      const ofWin = await fin.Window.wrap({ uuid, name });
      const info = await ofWin.getInfo();

      return { ...win, windowGroup, info, uuid, contextGroup:[] };
    });
    return { ...app, manifest, parentUuid, uuid, confirmed: false };
  });

  const layoutName = 'layout' + layoutId++;
  const layoutObject = { type: 'layout', name: layoutName, apps: layoutApps };
  return layoutObject;
};

const createLayout = async (layoutName: LayoutName, opts?: any): Promise<Layout> => {
  // TODO: figure out how to actually make options work.... optoins not being used right now
  const currentLayout = await getCurrentLayout();
  const options = opts || {};
  const layout = { ...currentLayout, ...options, name: layoutName };
  layouts.set(layoutName, layout);
  return layout;
};

// UTILS
const getGroup = async (identity:Identity): Promise<(Identity&Url)[]> => {
  const { uuid, name } = identity;
  const ofWin = await fin.Window.wrap({uuid, name});
  const group = await ofWin.getGroup();
  return promiseMap(group, async (wrappedWindow: any) => {
    // only identities, not wrapped windows
    const info = await wrappedWindow.getInfo();
    const { uuid, name } = wrappedWindow;
    return { uuid, name, url: info.url };
  })
};

const appsToRestore = new Map();

const setAppToRestore = (layoutApp: LayoutApp, resolve: Function): void =>  {
  const { uuid } = layoutApp;
  const save = { layoutApp, resolve }
  appsToRestore.set(uuid, save);
  if(isClientConnection(layoutApp)) {
    restoreApplication(layoutApp, resolve);
  }
}

const restoreApplication = async (layoutApp: LayoutApp, resolve: Function): Promise<void> =>  {
  const { uuid } = layoutApp;
  const defaultResponse: LayoutApp = { ...layoutApp, childWindows:[] }
  const identity = { uuid, name: uuid };
  const responseAppLayout: LayoutApp|false = await providerChannel.dispatch(identity, 'restoreApp', layoutApp);
  if(responseAppLayout) {
    resolve(responseAppLayout);
  } else {
    resolve(defaultResponse);
  }
  appsToRestore.delete(uuid);
}

// ENTRY POINT
async function registerService(): Promise<Provider> {
  const providerChannel = await fin.Service.register('layouts');
  providerChannel.register('setLayout', setLayout);
  providerChannel.register('getLayout', getLayout);
  providerChannel.register('restoreLayout', restoreLayout);
  providerChannel.onConnection(async (identity: Identity) => {
    const appToRestore = appsToRestore.get(identity.uuid);
    if(appToRestore) {
      const { layoutApp, resolve } = appToRestore;
      restoreApplication(layoutApp, resolve);
    }
  })
  return providerChannel;
}

const getLayout = (layoutName: LayoutName): Layout => {
  return layouts.get(layoutName);
}

const saveLayout = (layout: Layout) => {
  providerChannel.publish('layout-saved', layout);
  layouts.set(layout.name, layout);
};

const isClientConnection = (identity: LayoutApp|Identity) => {
  // i want to access connections....
  return providerChannel.connections.some((conn:any) => {
    identity.uuid === conn.uuid;
  });
}

const setLayout = async (payload: LayoutName|Layout, identity: Identity): Promise<Layout> => {
  // FIX THIS SHAPE
  const preLayout = await flexibleGetLayout(payload);

  const apps = await promiseMap (preLayout.apps, async (app: any) => {
    if(isClientConnection(app)) {
      console.log('matching app', app.uuid);

      // HOW TO DEAL WITH HUNG REQUEST HERE? RESHAPE IF GET NOTHING BACK?
      const updatedAppOptions = await providerChannel.dispatch({uuid: app.uuid, name: app.uuid}, 'savingLayout', app);
      updatedAppOptions.confirmed = true;
      console.log('before, after', app, updatedAppOptions);
      return updatedAppOptions;
    } else {
      app.confirmed = false;
      return app;
    }
  });

  const confirmedLayout = { ...preLayout, apps };
  saveLayout(confirmedLayout);
  return confirmedLayout;
};

export function main() {
  return registerService().then(channel => {
    window.providerChannel = providerChannel = channel;
  });
}

const positionWindow = async (win:WindowState | Identity) => {
  const ofWin = fin.Window.wrap(win);
  await ofWin.setBounds(win);
}

const flexibleGetLayout = async (input: Layout|LayoutName): Promise<Layout> => {
  if (typeof input === 'string') {
    const layout = layouts.get(input);
    if(typeof layout === 'object') {
      return layout;
    } else {
      return createLayout(input);
    }
  } else if (typeof input === 'object') {
    return input;
  } else {
    throw new Error ('layout not found');
  }
}

const restoreLayout = async (payload: LayoutName|Layout, identity: Identity): Promise<Layout> => {
  const layout = await flexibleGetLayout(payload);
  const startupApps: Promise<LayoutApp>[] = [];
  // cannot use async/await here because we may need to return a promise that later resolves
  const apps = await promiseMap(layout.apps, async (app: any): Promise<LayoutApp> => {
    // get rid of childWindows (anything else?)
    const defaultResponse = { ...app, childWindows:[] }
    const { uuid } = app;

    const ofApp = await fin.Application.wrap({ uuid });
    const isRunning = await ofApp.isRunning();
    if(isRunning) {
      if(isClientConnection(app)) {
        await positionWindow(app.mainWindow);
        // LATER SET CONTEXT HERE

        const response: LayoutApp|false = await providerChannel.dispatch({uuid, name: uuid }, 'restoreApp', app);
        return response ? response : defaultResponse;
      } else {
        // not connencted, return default response
        return defaultResponse;
      }
    } else {
      let ofApp: any;
      // not running, start app
      if(app.manifestUrl && typeof app.manifest === 'object' && app.manifest.uuid === app.uuid) {
        // started from manifest
        ofApp = await fin.Application.createFromManifest(app.manifestUrl);
      } else {
        const info = app && app.mainWindow && app.mainWindow.info;
        ofApp = fin.Application.create(info)
      }
      // make sure this works.....
      await positionWindow(app.mainWindow);
      await ofApp.run();
      if(app.confirmed) {
        startupApps.push(new Promise ((resolve: (layoutApp: LayoutApp) => void) => {
          setAppToRestore(app, resolve);
        }));
        return defaultResponse;
      } else {
        return defaultResponse;
      }
    }
  })
  const startupResponses = await Promise.all(startupApps);
  const allAppResponses = apps.map(app => {
    const appResponse = startupResponses.find(appRes => appRes.uuid === app.uuid);
    return appResponse ? appResponse : app;
  });

  layout.apps = allAppResponses;
  return layout;
}