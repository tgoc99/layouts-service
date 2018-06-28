const url = `${launchDir}/frameless-window.html`;
const openChild = (name) => {
    const win = fin.Window.create({
        url,
        autoShow: true,
        defaultHeight: 250 + 50*i,
        defaultWidth: 250 + 50*i,
        defaultLeft: 320*(i%3),
        defaultTop: i > 2 ? 400 : 50,
        saveWindowState: true,

        name
    });
    return win;
}

const openApp = async () => {
    const appUrl = `${launchDir}/app2.json`;
    console.log('appurl', appUrl);
    fin.desktop.Application.createFromManifest(appUrl, a=>a.run());
}

const forgetWindows = [];
const forgetMe = (identity) => {
    forgetWindows.push(identity);
};
const removeForgetWins = (window) => {
    return !forgetWindows.some(w => w.name === window.name)
}
window.forgetMe = forgetMe;

const onAppRes = async (layoutApp) => {
    console.log('apprestore', layoutApp)
    const ofApp = await fin.Application.getCurrent();
    const openWindows = await ofApp.getChildWindows();
    console.log('ow', openWindows);
    const filtered = layoutApp.childWindows.filter(removeForgetWins);
    const promises = filtered.map(async win => {
        console.log('got here');
        if(!openWindows.some(w => w.identity.name === win.name)) {
            const ofWin = await openChild(win.name);
            await ofWin.setBounds(win).catch(console.log);
        } else {
            const ofWin = await fin.Window.wrap(win);
            await ofWin.setBounds(win);
        }
    });
    console.log('before prom map', promises);
    await Promise.all(promises);
    console.log('made it!!!');
    // MAKE THIS BASED ON ACTUALS.....
    return layoutApp;
}

setTimeout(() => {
    console.log('to run');
    window.Layouts.default.onWillSaveLayout(layoutApp => {
        console.log('wsl');
        return layoutApp
    });
    window.Layouts.default.onAppRestore(onAppRes);
    window.Layouts.default.ready();
}, 1500);