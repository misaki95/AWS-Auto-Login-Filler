// Ensure compatibility with Chrome and Firefox
if (typeof browser === "undefined") {
    var browser = chrome;
}

// Encryption key management
let encryptionKey = null;
let pendingKeyResolvers = [];
let promptWindowId = null;

// Derive encryption key from master password
async function deriveKeyFromPassword(password) {
    try {
        const enc = new TextEncoder();
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            enc.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        const salt = await getSalt();
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: { name: 'SHA-256' }
            },
            passwordKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    } catch (error) {
        console.error('Error deriving key from password:', error);
        throw error;
    }
}

// Get or generate salt
async function getSalt() {
    const storedSalt = await browser.storage.local.get('encryptionSalt');
    if (storedSalt.encryptionSalt) {
        return new Uint8Array(storedSalt.encryptionSalt);
    } else {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        await browser.storage.local.set({ encryptionSalt: Array.from(salt) });
        return salt;
    }
}

// Encrypt data
async function encryptData(data) {
    const key = await getKey();
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Convert data to string format
    const dataToEncrypt = typeof data === 'string' ? data : JSON.stringify(data);

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        enc.encode(dataToEncrypt)
    );

    return {
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encrypted))
    };
}

// Decrypt data
async function decryptData(encryptedData) {
    // If encryptedData is an empty string, return an empty string
    if (encryptedData === '') {
        return '';
    }

    const key = await getKey();

    console.log(encryptedData);
    if (!encryptedData.data || !encryptedData.iv) {
        console.error("Invalid encryptedData object:", encryptedData);
        throw new Error("Invalid encryptedData object");
    }

    const encryptedArray = new Uint8Array(encryptedData.data);
    const ivArray = new Uint8Array(encryptedData.iv);

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivArray },
        key,
        encryptedArray
    );

    const dec = new TextDecoder();
    const decodedText = dec.decode(decrypted);

    try {
        const result = JSON.parse(decodedText);
        return result;
    } catch (error) {
        return decodedText;
    }
}

// Get encryption key
function getKey() {
    if (encryptionKey) {
        return Promise.resolve(encryptionKey);
    }

    // If the prompt window is not open, open the password prompt page
    if (!promptWindowId) {
        browser.windows.create({
            url: browser.runtime.getURL("prompt.html"),
            type: "popup",
            width: 400,
            height: 300
        }).then(windowInfo => {
            promptWindowId = windowInfo.id;
        });
    }

    // Return a Promise that will be resolved when the key is set
    return new Promise((resolve, reject) => {
        pendingKeyResolvers.push(resolve);
        // Set a timeout, if the user does not provide the master password within the specified time, reject the Promise
        setTimeout(() => {
            const index = pendingKeyResolvers.indexOf(resolve);
            if (index !== -1) {
                pendingKeyResolvers.splice(index, 1);
            }
            reject(new Error('Master password not provided'));
        }, 60000); // 1 minute timeout
    });
}

// Resolve all pending Promises when the key is set
function setEncryptionKey(key) {
    encryptionKey = key;
    pendingKeyResolvers.forEach(resolve => resolve(encryptionKey));
    pendingKeyResolvers = [];

    // Close the prompt window (if open)
    if (promptWindowId !== null) {
        browser.windows.remove(promptWindowId).then(() => {
            promptWindowId = null;
        }).catch(error => {
            promptWindowId = null;
        });
    }
}

// Handle messages from other scripts
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'setMasterPassword') {
        deriveKeyFromPassword(request.password)
            .then(key => {
                setEncryptionKey(key);
                sendResponse({ status: 'success' });
            })
            .catch(error => {
                sendResponse({ status: 'error', message: error.message });
            });
        return true;
    } else if (request.action === 'hasKey') {
        sendResponse(encryptionKey ? true : false);
    } else if (request.action === 'encrypt') {
        encryptData(request.data)
            .then(encryptedData => {
                sendResponse({ status: 'success', encryptedData: encryptedData });
            })
            .catch(error => {
                sendResponse({ status: 'error', message: error.message });
            });
        return true;
    } else if (request.action === 'decrypt') {
        decryptData(request.encryptedData)
            .then(decryptedData => {
                sendResponse({ status: 'success', decryptedData: decryptedData });
            })
            .catch(error => {
                sendResponse({ status: 'error', message: error.message });
            });
        return true;
    } else if (request.action === 'autofill') {
        handleAutofill(request.data, sendResponse);
        return true;
    }
});

// Handle autofill logic
async function handleAutofill(credential, sendResponse) {
    try {
        const decryptedUsername = await decryptData(credential.username);
        const decryptedPassword = credential.password ? await decryptData(credential.password) : '';

        credential.decryptedUsername = decryptedUsername;
        credential.decryptedPassword = decryptedPassword;

        let queryOptions = {};
        if (credential.containerId) {
            queryOptions.cookieStoreId = credential.containerId;
        }

        browser.tabs.query(queryOptions, (tabs) => {
            const awsTabs = tabs.filter(tab => tab.url && tab.url.includes('.signin.aws.amazon.com'));
            if (awsTabs.length > 0) {
                const awsTab = awsTabs[0];
                browser.tabs.update(awsTab.id, { active: true });
                injectAndSendMessage(awsTab.id, credential, sendResponse);
            } else {
                const accountId = credential.accountId;
                const awsLoginUrl = `https://${accountId}.signin.aws.amazon.com/console`;

                const tabOptions = { url: awsLoginUrl };
                if (credential.containerId) {
                    tabOptions.cookieStoreId = credential.containerId;
                }

                browser.tabs.create(tabOptions).then((newTab) => {
                    addNavigationListener(newTab.id, credential, sendResponse);
                }).catch(error => {
                    sendResponse({ status: 'error', message: 'Unable to open tab in specified container' });
                });
            }
        });
    } catch (error) {
        sendResponse({ status: 'error', message: 'Error handling autofill' });
    }
}

let injectedTabs = new Set(); // Used to prevent duplicate content script injection

function injectAndSendMessage(tabId, data, sendResponse) {
    if (injectedTabs.has(tabId)) {
        browser.tabs.sendMessage(tabId, { action: 'autofill_action', data: data })
            .then(() => sendResponse({ status: 'success' }))
            .catch(error => {
                sendResponse({ status: 'error', message: 'Failed to send autofill message' });
            });
    } else {
        browser.tabs.executeScript(tabId, { file: 'content.js', runAt: 'document_idle' })
            .then(() => {
                injectedTabs.add(tabId);
                browser.tabs.sendMessage(tabId, { action: 'autofill_action', data: data })
                    .then(() => sendResponse({ status: 'success' }))
                    .catch(error => {
                        sendResponse({ status: 'error', message: 'Failed to send autofill message' });
                    });
            })
            .catch(error => {
                sendResponse({ status: 'error', message: 'Unable to inject content script into tab' });
            });
    }
}

function addNavigationListener(tabId, data, sendResponse) {
    const listener = function(details) {
        if (details.tabId === tabId) {
            browser.webNavigation.onCompleted.removeListener(listener);
            injectAndSendMessage(tabId, data, sendResponse);
        }
    };
    browser.webNavigation.onCompleted.addListener(listener, { url: [{ urlMatches: '.*' }] });
}