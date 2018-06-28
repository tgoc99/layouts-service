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
    return JSON.parse(this.storage.getItem(key));
  }

  set(key: string, value: any) {
    this.storage.setItem(key, JSON.stringify(value));
  }
}

const layouts = new Storage();
let layoutId = 1;
let providerChannel:Provider;

const getCurrentLayout = async (): Promise<Layout> => {
  let apps = await fin.System.getAllWindows();
  apps = apps.filter((a:any) => a.uuid !== 'Layout-Manager')
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

    app.mainWindow = { ...app.mainWindow, windowGroup: mainWindowGroup, info: mainWindowInfo, uuid, contextGroups:[] };
    app.childWindows = await promiseMap(app.childWindows, async (win:WindowState) => {
      const { name } = win;
      const windowGroup = await getGroup({ uuid, name });
      console.log('after group', windowGroup);
      const ofWin = await fin.Window.wrap({ uuid, name });
      const info = await ofWin.getInfo();

      return { ...win, windowGroup, info, uuid, contextGroups:[] };
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
  console.log('lo', layout);
  return layout;
};

const appsToRestore = new Map();

const setAppToRestore = (layoutApp: LayoutApp, resolve: Function): void =>  {
  const { uuid } = layoutApp;
  const save = { layoutApp, resolve };
  appsToRestore.set(uuid, save);
};

const restoreApplication = async (layoutApp: LayoutApp, resolve: Function): Promise<void> =>  {
  const { uuid } = layoutApp;
  const defaultResponse: LayoutApp = { ...layoutApp, childWindows:[] };
  const identity = { uuid, name: uuid };
  console.log('in restoreapplication fn');
  const responseAppLayout: LayoutApp|false = await providerChannel.dispatch(identity, 'restoreApp', layoutApp);
  if(responseAppLayout) {
    resolve(responseAppLayout);
  } else {
    resolve(defaultResponse);
  }
  appsToRestore.delete(uuid);
};

// ENTRY POINT
async function registerService(): Promise<Provider> {
  const providerChannel = await fin.desktop.Service.register('layouts');
  providerChannel.register('setLayout', setLayout);
  providerChannel.register('getLayout', getLayout);
  providerChannel.register('restoreLayout', restoreLayout);
  providerChannel.register('appReady', (payload: any, identity: Identity) => {
    const appToRestore = appsToRestore.get(identity.uuid);
    if(appToRestore) {
      const { layoutApp, resolve } = appToRestore;
      console.log('in on connn')
      restoreApplication(layoutApp, resolve);
    }
  });
  return providerChannel;
}

const getLayout = (layoutName: LayoutName): string/* Layout */ => {
  return layouts.get(layoutName);
};

const saveLayout = (layout: Layout) => {
  providerChannel.publish('layout-saved', layout);
  layouts.set(layout.name, layout);
};

const isClientConnection = (identity: LayoutApp|Identity) => {
  // i want to access connections....
  //@ts-ignore
  return providerChannel.connections.some((conn:any) => {
    return identity.uuid === conn.uuid;
  });
};

// payload eventually could be a layout... for now just a name to set current layout
const setLayout = async (payload: LayoutName, identity: Identity): Promise<Layout> => {
  // FIX THIS SHAPE - only a string for now.... 
  const preLayout = await createLayout(payload);
  console.log('plo', preLayout);

  const apps = await promiseMap (preLayout.apps, async (app: any) => {
    console.log('app', app)
    const defaultResponse = { ...app, childWindows:[] };
    if(isClientConnection(app)) {
      console.log('matching app', app.uuid);

      // HOW TO DEAL WITH HUNG REQUEST HERE? RESHAPE IF GET NOTHING BACK?
      let updatedAppOptions = await providerChannel.dispatch({uuid: app.uuid, name: app.uuid}, 'savingLayout', app);
      if (!updatedAppOptions) {
        updatedAppOptions = defaultResponse;
      }
      updatedAppOptions.confirmed = true;
      console.log('before, after', app, updatedAppOptions);
      return updatedAppOptions;
    } else {
      return defaultResponse;
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

main();

const positionWindow = async (win:WindowState | Identity) => {
  try { 
    const ofWin = await fin.Window.wrap(win);
    await ofWin.setBounds(win);
  } catch (e) {
    console.error('set bounds error', e);
  }
};

const flexibleGetLayout = async (input: Layout|LayoutName): Promise<Layout> => {
  if (typeof input === 'string') {
    const layout = getLayout(input);
    if(layout && typeof layout === 'object') {
      return layout;
    } 
  } else if (typeof input === 'object') {
    return input;
  }
  throw new Error ('layout not found');
};

const restoreLayout = async (payload: LayoutName|Layout, identity: Identity): Promise<Layout> => {
  const layout = await flexibleGetLayout(payload);
  const startupApps: Array<Promise<LayoutApp>> = [];
  // cannot use async/await here because we may need to return a promise that later resolves
  console.log('restore layout', layout);
  const apps = await promiseMap(layout.apps, async (app: any): Promise<LayoutApp> => {
    // get rid of childWindows (anything else?)
    const defaultResponse = { ...app, childWindows:[] };
    const { uuid } = app;
    console.log('app', app);
    const ofApp = await fin.Application.wrap({ uuid });
    const isRunning = await ofApp.isRunning();
    if(isRunning) {
      if(isClientConnection(app)) {
        await positionWindow(app.mainWindow);
        // LATER SET CONTEXT HERE
        console.log('in isrunning', app)
        const response: LayoutApp|false = await providerChannel.dispatch({uuid, name: uuid }, 'restoreApp', app);
        console.log('response', response)
        return response ? response : defaultResponse;
      } else {
        await positionWindow(app.mainWindow);
        // not connected, return default response
        return defaultResponse;
      }
    } else {
      let ofApp: any;
      // not running - setup comm once started
      if(app.confirmed) {
        console.log('out of isrunning', app)
        startupApps.push(new Promise ((resolve: (layoutApp: LayoutApp) => void) => {
          setAppToRestore(app, resolve);
          console.log('after set app to restore');
        }));
      }
      // start app
      if(app.manifestUrl && typeof app.manifest === 'object' && app.manifest.uuid === app.uuid) {
        console.log('in the manifest stuff...')
        // started from manifest
        ofApp = await fin.Application.createFromManifest(app.manifestUrl);
      } else {
        console.log('NOT in the manifest stuff...')
        // const info = app && app.mainWindow && app.mainWindow.info;
        const info = app && app.manifest && app.manifest.startup_app;
        console.log('not man, info', info);
        ofApp = await fin.Application.create(info);
      }
      // make sure this works.....
      // await positionWindow(app.mainWindow);
      console.log('about to run app:', ofApp);
      await ofApp.run().catch(console.log);
      await positionWindow(app.mainWindow);

      return defaultResponse;
    }
  });
  const startupResponses = await Promise.all(startupApps);
  const allAppResponses = apps.map(app => {
    const appResponse = startupResponses.find(appRes => appRes.uuid === app.uuid);
    return appResponse ? appResponse : app;
  });
  console.log('before group');
  await regroupLayout(apps).catch(console.log);
  layout.apps = allAppResponses;
  return layout;
};

// UTILS
const getGroup = (identity:Identity): Promise<Array<Identity>> => {
  const { uuid, name } = identity;
  const ofWin = fin.desktop.Window.wrap(uuid, name);
  // v2api getgroup broken
  return new Promise (res=> {
    ofWin.getGroup((group: { identity: Identity }[]) => {
      console.log('group v1', group);
      const groupIds = group.map((win:any) => {
        const { uuid, name } = win;
        return { uuid, name };
      });
      res(groupIds);
    });
  })
  // return promiseMap(group, async (wrappedWindow: any) => {
  //   // only identities, not wrapped windows
  //   const info = await wrappedWindow.getInfo();
  //   const { uuid, name } = wrappedWindow.identity;
  //   return { uuid, name, url: info.url };
  // });
};

const regroupLayout = async (apps:LayoutApp[]) => {
  await promiseMap(apps, async (app:LayoutApp): Promise<void> =>  {
    await groupWindow(app.mainWindow);
    await promiseMap(app.childWindows, async (child: WindowState) => {
      await groupWindow(child);
    })
  })
}

const groupWindow = async (win: WindowState) => {
  const { uuid, name } = win;
  const ofWin = await fin.Window.wrap({ uuid, name });
  await promiseMap(win.windowGroup, async (w:Identity) => {
    const toGroup = await fin.Window.wrap({uuid: w.uuid, name: w.name});
    console.log('about to merge', toGroup, ofWin);
    await ofWin.mergeGroups(toGroup);
  })  
}