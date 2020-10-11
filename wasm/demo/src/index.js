import 'codemirror/addon/comment/comment';
import 'codemirror/lib/codemirror.css';
import 'codemirror/mode/python/python';
import LocalEchoController from 'local-echo';
import 'normalize.css';
import { Terminal } from 'xterm';
import 'xterm/lib/xterm.css';
import './style.css';

let rp;

// A dependency graph that contains any wasm must be imported asynchronously.
import('rustpython')
    .then(rustpy => {
        rp = rustpy;
        // so people can play around with it
        window.rp = rustpy;
        onReady();
    })
    .catch(e => {
        console.error('Error importing `rustpython`:', e);
        document.getElementById('error').textContent = e;
    });


const snippets = document.getElementById('snippets');

function updateSnippet() {
    const selected = snippets.value;

    // the require here creates a webpack context; it's fine to use it
    // dynamically.
    // https://webpack.js.org/guides/dependency-management/
    const {
        default: snippet
    } = require(`raw-loader!../snippets/${selected}.py`);

    editor.setValue(snippet);
    runCodeFromTextarea();
}

const term = new Terminal();
term.open(document.getElementById('terminal'));

const localEcho = new LocalEchoController(term);

let terminalVM;

function getPrompt(name) {
    terminalVM.exec(`
try:
    import sys as __sys
    __prompt = __sys.${name}
except:
    __prompt = ''
finally:
    del __sys
`);
    return String(terminalVM.eval('__prompt'));
}

async function readPrompts() {
    let continuing = false;

    while (true) {
        const ps1 = getPrompt('ps1');
        const ps2 = getPrompt('ps2');
        let input;
        if (continuing) {
            const prom = localEcho.read(ps2, ps2);
            localEcho._activePrompt.prompt = ps1;
            localEcho._input = localEcho.history.entries.pop() + '\n';
            localEcho._cursor = localEcho._input.length;
            localEcho._active = true;
            input = await prom;
            if (!input.endsWith('\n')) continue;
        } else {
            input = await localEcho.read(ps1, ps2);
        }
        try {
            terminalVM.execSingle(input);
        } catch (err) {
            if (err.canContinue) {
                continuing = true;
                continue;
            } else if (err instanceof WebAssembly.RuntimeError) {
                err = window.__RUSTPYTHON_ERROR || err;
            }
            localEcho.println(err);
        }
        continuing = false;
    }
}

function onReady() {
    snippets.addEventListener('change', updateSnippet);
    document
        .getElementById('run-btn')
        .addEventListener('click', runCodeFromTextarea);
    // Run once for demo
    runCodeFromTextarea();

    terminalVM = rp.vmStore.init('term_vm');
    terminalVM.setStdout(data => localEcho.print(data));
    readPrompts().catch(err => console.error(err));

    // so that the test knows that we're ready
    const readyElement = document.createElement('div');
    readyElement.id = 'rp_loaded';
    document.head.appendChild(readyElement);
}
