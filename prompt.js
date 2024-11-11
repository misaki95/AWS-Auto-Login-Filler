// Ensure compatibility with Chrome and Firefox
if (typeof browser === "undefined") {
    var browser = chrome;
  }
  
  document.addEventListener('DOMContentLoaded', function () {
    const submitButton = document.getElementById('submitMasterPassword');
    const errorMessage = document.getElementById('errorMessage');
  
    submitButton.addEventListener('click', async function () {
        const password = document.getElementById('masterPasswordInput').value;
        if (password) {
            try {
                const result = await browser.runtime.sendMessage({ action: 'setMasterPassword', password: password });
                if (result.status === 'success') {
                    window.close(); // Close the prompt window
                } else {
                    errorMessage.textContent = 'Failed to set master password: ' + result.message;
                }
            } catch (error) {
                console.error('Error setting master password:', error);
                errorMessage.textContent = 'An error occurred while setting the master password.';
            }
        } else {
            errorMessage.textContent = 'Please enter the master password.';
        }
    });
  });