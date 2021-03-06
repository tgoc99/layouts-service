const execa = require('execa');
const serve = require('./utils/serve')
const path = require('path')
const {launch} = require('hadouken-js-adapter')
const run = require('./utils/runLog')
const os = require('os')

let port;
let server

const cleanup = async res => {
    if (os.platform().match(/^win/)) {
        const cmd = 'taskkill /F /IM openfin.exe /T';
        execa.shellSync(cmd);
    } else {
        const cmd = `lsof -n -i4TCP:${port} | grep LISTEN | awk '{ print $2 }' | xargs kill`;
        execa.shellSync(cmd);
    }
    process.exit(res.code)
}

const fail = err => {
    console.error(err);
    process.exit(1);
}

require('./build')
    .then(() => require('./serve'))
    .then(async () => {
        port = await launch({manifestUrl: 'http://localhost:1337/test-app.json'})
        return port
    })
    .catch(fail)
    .then(OF_PORT => run('ava', [], { env: { OF_PORT } }))
    .then(cleanup)
    .catch(cleanup)