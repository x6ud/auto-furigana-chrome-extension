(function () {
    function postMessage(type, content) {
        /** @type {HTMLIFrameElement} */
        const sandboxIframe = document.getElementById('sandbox');
        sandboxIframe.contentWindow.postMessage({type, content}, "*");
    }

    window.addEventListener('message', async function (e) {
        const message = e.data;
        if (!message) {
            return;
        }
        switch (message.type) {
            case 'init': {
                const tabs = await chrome.tabs.query({active: true});
                const activeTab = tabs[0];
                const domain = new URL(activeTab.url).host;
                postMessage('domain', domain);
                chrome.storage.sync.get(function (items) {
                    const globalDisabled = items['globalDisabled'] || false;
                    const disabledDomains = items['disabledDomains'] || [];
                    const translationDisabled = items['translationDisabled'] || false;
                    const targetLang = items['targetLang'] || 'en';
                    chrome.tabs.sendMessage(activeTab.id, {type: 'is-enabled-on-tab'}, function (val) {
                        postMessage('state', {
                            globalDisabled,
                            disabledDomains,
                            currentTabEnabled: val,
                            translationDisabled,
                            targetLang,
                        });
                    });
                });
            }
                break;
            case 'set-global-disabled': {
                const disabled = message.content;
                await chrome.storage.sync.set({globalDisabled: disabled});
            }
                break;
            case 'enable-on-domain': {
                const domain = message.content;
                chrome.storage.sync.get(async function (items) {
                    let disabledDomains = items['disabledDomains'] || [];
                    disabledDomains = disabledDomains.filter(item => item !== domain);
                    await chrome.storage.sync.set({disabledDomains});
                });
            }
                break;
            case 'disable-on-domain': {
                const domain = message.content;
                chrome.storage.sync.get(async function (items) {
                    let disabledDomains = items['disabledDomains'] || [];
                    disabledDomains.push(domain);
                    await chrome.storage.sync.set({disabledDomains});
                });
            }
                break;
            case 'enable-on-current-tab': {
                await setCurrentTabEnable(true);
            }
                break;
            case 'disable-on-current-tab': {
                await setCurrentTabEnable(false);
            }
                break;
            case 'set-enable-translation': {
                const enable = message.content;
                await chrome.storage.sync.set({translationDisabled: !enable});
            }
                break;
            case 'set-target-lang': {
                await chrome.storage.sync.set({targetLang: message.content});
            }
                break;
        }
    });

    async function setCurrentTabEnable(enable) {
        const tabs = await chrome.tabs.query({active: true});
        const activeTab = tabs[0];
        chrome.tabs.sendMessage(
            activeTab.id,
            {type: 'set-enabled', content: enable}
        );
    }
})();