// Ensure compatibility with Chrome and Firefox
if (typeof browser === "undefined") {
    var browser = chrome;
}

// Add decryptData function
async function decryptData(encryptedData) {
    return new Promise((resolve, reject) => {
        browser.runtime.sendMessage({ action: 'decrypt', encryptedData: encryptedData })
            .then(response => {
                if (response.status === 'success') {
                    resolve(response.decryptedData);
                } else {
                    if (response.message === 'Master password not provided') {
                        // Wait for the user to enter the master password and retry decryption
                        waitForMasterPassword().then(() => {
                            // Recursively call decryptData to retry decryption
                            decryptData(encryptedData).then(resolve).catch(reject);
                        }).catch(reject);
                    } else {
                        reject(response.message);
                    }
                }
            })
            .catch(error => {
                console.error('Decryption failed:', error);
                reject(error);
            });
    });
}

// Wait for the master password to be set
function waitForMasterPassword() {
    return new Promise((resolve, reject) => {
        // Set up a polling interval to check if the background script has the key
        const checkInterval = setInterval(async () => {
            try {
                const hasKey = await browser.runtime.sendMessage({ action: 'hasKey' });
                if (hasKey) {
                    clearInterval(checkInterval);
                    resolve();
                }
            } catch (error) {
                console.error('Error checking for key:', error);
                clearInterval(checkInterval);
                reject(error);
            }
        }, 1000); // Check every second

        // Set a timeout to prevent infinite waiting
        setTimeout(() => {
            clearInterval(checkInterval);
            reject(new Error('Waiting for master password timed out'));
        }, 60000); // Maximum wait time of 60 seconds
    });
}

// Listen for messages from background.js and handle different actions
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'autofill_action') {
        fillFormFields(request.data);
        sendResponse({ status: 'alive' });
        return true; // Indicates that sendResponse will be called asynchronously
    } else if (request.action === 'ping') {
        sendResponse({ status: 'alive' });
    }
});

// Use the provided data to locate and fill form fields
async function fillFormFields(data) {
    const accountIdField = document.querySelector('input[name="account"]') || document.getElementById('account');
    const usernameField = document.querySelector('input[name="username"]') || document.getElementById('username');
    const passwordField = document.querySelector('input[name="password"]') || document.getElementById('password');

    if (accountIdField && usernameField && passwordField) {
        try {
            // Decrypt credentials
            const decryptedUsername = await decryptData(data.username);
            const decryptedPassword = data.password ? await decryptData(data.password) : '';

            // Fill fields with decrypted credentials
            fillField(accountIdField, data.accountId);
            fillField(usernameField, decryptedUsername);
            fillField(passwordField, decryptedPassword);

            browser.runtime.sendMessage({ status: 'form filled' });
        } catch (error) {
            console.error("Error decrypting credentials:", error);
            browser.runtime.sendMessage({ status: 'error', message: 'Decryption failed' });
        }
    } else {
        browser.runtime.sendMessage({ status: 'fields not found' });
    }
}

// Helper function to fill a field and trigger input and change events
function fillField(field, value) {
    field.value = value;
    triggerInputChange(field);
}

// Helper function to trigger input and change events
function triggerInputChange(field) {
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
}