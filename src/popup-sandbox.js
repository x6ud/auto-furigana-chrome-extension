Vue.createApp({
    template: document.getElementById('template').innerText,
    setup() {
        const enableOnAllPage = Vue.ref(false);
        const enableOnThisSite = Vue.ref(false);
        const siteDomain = Vue.ref('google.com');
        const enableOnThisTab = Vue.ref(false);
        const showTranslationOnMouseHover = Vue.ref(false);
        const targetLanguage = Vue.ref('en');

        // ==========================================

        function postMessage(type, content) {
            window.parent.postMessage({type, content}, "*");
        }

        window.addEventListener('message', function (e) {
            const message = e.data;
            if (!message) {
                return;
            }
            switch (message.type) {
                case 'domain': {
                    siteDomain.value = message.content;
                }
                    break;
                case 'state': {
                    const {
                        globalDisabled,
                        disabledDomains,
                        currentTabEnabled,
                        translationDisabled,
                        targetLang,
                    } = message.content;
                    enableOnAllPage.value = !globalDisabled;
                    enableOnThisSite.value = !disabledDomains.includes(siteDomain.value);
                    enableOnThisTab.value = currentTabEnabled;
                    showTranslationOnMouseHover.value = !translationDisabled;
                    targetLanguage.value = targetLang;
                }
            }
        });

        postMessage('init');

        // ==========================================

        function setEnableOnAllPage(val) {
            enableOnAllPage.value = val;
            postMessage('set-global-disabled', !val);
        }

        function setEnableOnThisSite(val) {
            enableOnThisSite.value = val;
            if (val) {
                postMessage('enable-on-domain', siteDomain.value);
            } else {
                postMessage('disable-on-domain', siteDomain.value);
            }
        }

        function setEnableOnThisTab(val) {
            enableOnThisTab.value = val;
            if (val) {
                postMessage('enable-on-current-tab');
            } else {
                postMessage('disable-on-current-tab');
            }
        }

        function setShowTranslationOnMouseHover(val) {
            showTranslationOnMouseHover.value = val;
            postMessage('set-enable-translation', val);
        }

        Vue.watch(targetLanguage, function (val) {
            postMessage('set-target-lang', val);
        });

        return {
            enableOnAllPage,
            enableOnThisSite,
            siteDomain,
            enableOnThisTab,
            showTranslationOnMouseHover,
            targetLanguage,

            setEnableOnAllPage,
            setEnableOnThisSite,
            setEnableOnThisTab,
            setShowTranslationOnMouseHover,
        };
    }
}).mount('#app');