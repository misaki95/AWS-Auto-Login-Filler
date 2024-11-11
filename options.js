let credentials = [];
let containersList = [];

// Ensure compatibility with Chrome and Firefox
if (typeof browser === "undefined") {
    var browser = chrome;
}

// Load existing credentials and containers from storage when the page loads
document.addEventListener('DOMContentLoaded', async function() {
    const credentialsSection = document.getElementById('credentialsSection');
    const errorMessageElement = document.getElementById('errorMessage');

    initializeOptionsPage();

    // Initialize the options page
    async function initializeOptionsPage() {
        try {
            await loadCredentials();
            await loadContainers();
        } catch (error) {
            handleError('Error initializing options page:', error);
        }
    }

    async function loadCredentials() {
        return new Promise((resolve, reject) => {
            browser.storage.local.get(['awsCredentials'], async function(data) {
                credentials = data.awsCredentials || [];
                await renderCredentialsTable();
                resolve();
            });
        });
    }

    async function loadContainers() {
        if (browser.contextualIdentities) {
            try {
                containersList = await browser.contextualIdentities.query({});
                renderContainerOptions();
                await renderCredentialsTable();
            } catch (error) {
                handleError('Error fetching containers:', error);
            }
        } else {
            console.warn('This browser does not support the Contextual Identities API.');
        }
    }

    function renderContainerOptions() {
        const containerSelect = document.getElementById('newContainerId');
        if (!containerSelect) return;

        // Clear the select element
        containerSelect.textContent = '';

        // Create the first option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a container (optional)';
        containerSelect.appendChild(defaultOption);

        // Create options for each container
        containersList.forEach(container => {
            const option = document.createElement('option');
            option.value = container.cookieStoreId;
            option.textContent = container.name;
            containerSelect.appendChild(option);
        });
    }

    async function renderCredentialsTable() {
        const tableBody = document.getElementById('credentialsTable');

        // Clear the table content
        tableBody.textContent = '';

        for (const [index, cred] of credentials.entries()) {
            const row = document.createElement('tr');
            const { decryptedUsername, decryptedPassword } = await decryptCredentials(cred);

            // Create each cell and set its content
            const accountInfoCell = document.createElement('td');
            const accountInfoInput = document.createElement('input');
            accountInfoInput.type = 'text';
            accountInfoInput.value = cred.accountInfo || '';
            accountInfoInput.dataset.index = index;
            accountInfoInput.dataset.type = 'accountInfo';
            accountInfoInput.placeholder = 'Account Info';
            accountInfoInput.disabled = true;
            accountInfoCell.appendChild(accountInfoInput);

            const accountIdCell = document.createElement('td');
            const accountIdInput = document.createElement('input');
            accountIdInput.type = 'text';
            accountIdInput.value = cred.accountId;
            accountIdInput.dataset.index = index;
            accountIdInput.dataset.type = 'accountId';
            accountIdInput.disabled = true;
            accountIdCell.appendChild(accountIdInput);

            const usernameCell = document.createElement('td');
            const usernameInput = document.createElement('input');
            usernameInput.type = 'text';
            usernameInput.value = decryptedUsername;
            usernameInput.dataset.index = index;
            usernameInput.dataset.type = 'username';
            usernameInput.disabled = true;
            usernameCell.appendChild(usernameInput);

            const passwordCell = document.createElement('td');
            const passwordInput = document.createElement('input');
            passwordInput.type = 'password';
            passwordInput.value = decryptedPassword;
            passwordInput.dataset.index = index;
            passwordInput.dataset.type = 'password';
            passwordInput.disabled = true;
            passwordCell.appendChild(passwordInput);

            const containerCell = document.createElement('td');
            const select = createContainerSelect(cred.containerId, index, true);
            containerCell.appendChild(select);

            const actionsCell = document.createElement('td');
            const editButton = document.createElement('button');
            editButton.className = 'btn btn-edit';
            editButton.textContent = 'Edit';
            editButton.addEventListener('click', () => toggleEditSave(index, row));

            const deleteButton = document.createElement('button');
            deleteButton.className = 'btn btn-delete';
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', () => deleteAccount(index));

            actionsCell.appendChild(editButton);
            actionsCell.appendChild(deleteButton);

            // Append all cells to the row
            row.appendChild(accountInfoCell);
            row.appendChild(accountIdCell);
            row.appendChild(usernameCell);
            row.appendChild(passwordCell);
            row.appendChild(containerCell);
            row.appendChild(actionsCell);

            // Append the row to the table body
            tableBody.appendChild(row);
        }
    }

    async function decryptCredentials(cred) {
        let decryptedUsername = '';
        let decryptedPassword = '';

        try {
            if (cred.username) {
                decryptedUsername = await decryptData(cred.username);
            }
            if (cred.password) {
                decryptedPassword = await decryptData(cred.password);
            }
        } catch (error) {
            handleError('Error decrypting credentials:', error);
            decryptedUsername = '[Decryption Failed Username]';
            decryptedPassword = '[Decryption Failed Password]';
            errorMessageElement.textContent = 'Failed to decrypt credentials. Please ensure you have entered the correct master password.';
        }

        return { decryptedUsername, decryptedPassword };
    }

    function createContainerSelect(selectedContainerId, index, disabled) {
        const select = document.createElement('select');
        select.dataset.index = index;
        select.dataset.type = 'containerId';
        select.disabled = disabled;

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a container (optional)';
        select.appendChild(defaultOption);

        containersList.forEach(container => {
            const option = document.createElement('option');
            option.value = container.cookieStoreId;
            option.textContent = container.name;
            if (container.cookieStoreId === selectedContainerId) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        return select;
    }

    async function toggleEditSave(index, row) {
        const isEditing = row.classList.contains('editing');
        const inputs = row.querySelectorAll('input, select');
    
        if (isEditing) {
            inputs.forEach(input => input.disabled = true);
            row.classList.remove('editing');
    
            const encryptedUsername = await encryptData(inputs[2].value);
            const encryptedPassword = inputs[3].value ? await encryptData(inputs[3].value) : '';

            credentials[index] = {
                accountInfo: inputs[0].value,
                accountId: inputs[1].value,
                username: encryptedUsername,
                password: encryptedPassword,
                containerId: inputs[4].value
            };
            await saveCredentials();
        } else {
            inputs.forEach(input => input.disabled = false);
            row.classList.add('editing');
        }
    
        row.querySelector('.btn-edit').textContent = isEditing ? 'Edit' : 'Save';
    }

    async function saveCredentials() {
        try {
            await browser.storage.local.set({ 'awsCredentials': credentials });
            showSaveMessage();
        } catch (error) {
            handleError('Error saving credentials:', error);
        }
    }

    function showSaveMessage() {
        const saveMessage = document.getElementById('saveMessage');
        if (saveMessage) {
            saveMessage.style.display = 'block';
            setTimeout(() => {
                saveMessage.style.display = 'none';
            }, 2000);
        }
    }

    const addAccountButton = document.getElementById('addAccount');
    if (addAccountButton) {
        addAccountButton.addEventListener('click', async function() {
            const newAccountInfo = document.getElementById('newAccountInfo').value.trim();
            const newAccountId = document.getElementById('newAccountId').value.trim();
            const newUsername = document.getElementById('newUsername').value.trim();
            const newPassword = document.getElementById('newPassword').value.trim();
            const newContainerId = document.getElementById('newContainerId').value;

            if (newAccountId && newUsername) {
                try {
                    const encryptedUsername = await encryptData(newUsername);
                    const encryptedPassword = newPassword ? await encryptData(newPassword) : '';

                    credentials.push({
                        accountInfo: newAccountInfo || '',
                        accountId: newAccountId,
                        username: encryptedUsername,
                        password: encryptedPassword,
                        containerId: newContainerId || null
                    });

                    await saveCredentials();
                    await renderCredentialsTable();
                    clearNewAccountFields();
                } catch (error) {
                    handleError('Error adding account:', error);
                }
            } else {
                alert("Please fill in all required fields.");
            }
        });
    }

    function clearNewAccountFields() {
        document.getElementById('newAccountInfo').value = '';
        document.getElementById('newAccountId').value = '';
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('newContainerId').selectedIndex = 0;
    }

    function deleteAccount(index) {
        credentials.splice(index, 1);
        saveCredentials();
        renderCredentialsTable();
    }

    async function encryptData(data) {
        return new Promise((resolve, reject) => {
            browser.runtime.sendMessage({ action: 'encrypt', data: data })
                .then(response => {
                    if (response.status === 'success') {
                        resolve(response.encryptedData);
                    } else {
                        reject(response.message);
                    }
                })
                .catch(error => {
                    handleError('Encryption failed:', error);
                    reject(error);
                });
        });
    }

    async function decryptData(encryptedData) {
        return new Promise((resolve, reject) => {
            browser.runtime.sendMessage({ action: 'decrypt', encryptedData: encryptedData })
                .then(async response => {
                    if (response.status === 'success') {
                        resolve(response.decryptedData);
                    } else {
                        if (response.message === 'Master password not provided') {
                            try {
                                await waitForMasterPassword();
                                const decryptedData = await decryptData(encryptedData);
                                resolve(decryptedData);
                            } catch (error) {
                                reject(error);
                            }
                        } else {
                            reject(response.message);
                        }
                    }
                })
                .catch(error => {
                    handleError('Decryption failed:', error);
                    reject(error);
                });
        });
    }

    function waitForMasterPassword() {
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(async () => {
                try {
                    const hasKey = await browser.runtime.sendMessage({ action: 'hasKey' });
                    if (hasKey) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                } catch (error) {
                    handleError('Error checking for key:', error);
                    clearInterval(checkInterval);
                    reject(error);
                }
            }, 1000);

            setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error('Waiting for master password timed out'));
            }, 60000);
        });
    }

    function handleError(message, error) {
        console.error(message, error);
        const errorMessageElement = document.getElementById('errorMessage');
        if (errorMessageElement) {
            errorMessageElement.textContent = message;
        }
    }
});