// Ensure compatibility with Chrome and Firefox
if (typeof browser === "undefined") {
    var browser = chrome;
}

document.addEventListener('DOMContentLoaded', async function () {
    const masterPasswordSection = document.getElementById('masterPasswordSection');
    const accountListSection = document.getElementById('accountListSection');
    const submitButton = document.getElementById('submitMasterPassword');
    const errorMessage = document.getElementById('errorMessage');

    try {
        const hasKey = await browser.runtime.sendMessage({ action: 'hasKey' });
        toggleSections(hasKey);
        if (hasKey) {
            loadAccountList();
        }
    } catch (error) {
        handleError('Error checking for key:', error);
    }

    submitButton.addEventListener('click', async function () {
        const password = document.getElementById('masterPasswordInput').value;
        if (password) {
            try {
                const result = await browser.runtime.sendMessage({ action: 'setMasterPassword', password: password });
                if (result.status === 'success') {
                    toggleSections(true);
                    loadAccountList();
                } else {
                    showErrorMessage('Failed to set master password: ' + result.message);
                }
            } catch (error) {
                handleError('Error setting master password:', error);
                showErrorMessage('An error occurred while setting the master password.');
            }
        } else {
            showErrorMessage('Please enter the master password.');
        }
    });

    async function loadAccountList() {
        const accountListElement = document.getElementById('accountList');
        accountListElement.textContent = ''; // Clear the list
    
        try {
            const data = await browser.storage.local.get(['awsCredentials']);
            const credentialsArray = data.awsCredentials || [];
    
            if (credentialsArray.length === 0) {
                const noAccountMessage = document.createElement('p');
                noAccountMessage.textContent = 'No AWS accounts added yet.';
                accountListElement.appendChild(noAccountMessage);
                return;
            }
    
            for (const cred of credentialsArray) {
                try {
                    const decryptedAccountInfo = cred.accountInfo || '';
                    const decryptedAccountId = cred.accountId;
                    const decryptedUsername = await decryptData(cred.username);
                    const decryptedPassword = cred.password ? await decryptData(cred.password) : '';
    
                    const accountItem = createAccountItem(decryptedAccountInfo, decryptedAccountId, cred);
                    accountListElement.appendChild(accountItem);
                } catch (error) {
                    handleError('Error decrypting account information:', error);
                }
            }
        } catch (error) {
            handleError('Error loading account list:', error);
        }
    }
    
    function createAccountItem(accountInfo, accountId, cred) {
        const accountItem = document.createElement('div');
        accountItem.className = 'account-item';
        accountItem.dataset.accountId = accountId;
    
        // Create and set elements for account info and account ID
        const accountInfoDiv = document.createElement('div');
        accountInfoDiv.className = 'account-info';
        accountInfoDiv.textContent = accountInfo;
    
        const accountDetailsDiv = document.createElement('div');
        accountDetailsDiv.className = 'account-details';
        accountDetailsDiv.textContent = `Account ID: ${accountId}`;
    
        // Add information to accountItem
        accountItem.appendChild(accountInfoDiv);
        accountItem.appendChild(accountDetailsDiv);
    
        // Add click event to account item
        accountItem.addEventListener('click', function () {
            selectAccount(cred);
        });
    
        return accountItem;
    }
    

    function selectAccount(cred) {
        browser.runtime.sendMessage({ action: 'autofill', data: cred })
            .then(response => {
                if (response.status === 'success') {
                    window.close();
                } else {
                    alert('Autofill failed: ' + response.message);
                }
            })
            .catch(error => {
                handleError('Error during autofill:', error);
                alert('An error occurred during autofill.');
            });
    }

    async function decryptData(encryptedData) {
        try {
            const response = await browser.runtime.sendMessage({ action: 'decrypt', encryptedData: encryptedData });
            if (response.status === 'success') {
                return response.decryptedData;
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            handleError('Decryption failed:', error);
            throw error;
        }
    }

    function toggleSections(hasKey) {
        if (hasKey) {
            masterPasswordSection.style.display = 'none';
            accountListSection.style.display = 'block';
        } else {
            masterPasswordSection.style.display = 'block';
            accountListSection.style.display = 'none';
        }
    }

    function showErrorMessage(message) {
        errorMessage.textContent = message;
    }

    function handleError(message, error) {
        console.error(message, error);
        showErrorMessage(message);
    }
});