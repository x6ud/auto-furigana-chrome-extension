(function () {
    'use strict';

    let enableInsertRomaji = true;

    const excludeTags = new Set(['ruby', 'rt', 'script', 'select', 'option', 'textarea']);

    // ============== observe ==============
    let domChanged = false;
    const observer = new MutationObserver(mutations => {
        if (!enableInsertRomaji) {
            return;
        }
        if (domChanged) {
            return;
        }
        for (let mutation of mutations) {
            for (let node of mutation.addedNodes) {
                if (excludeTags.has(node.nodeName.toLowerCase())) {
                    continue;
                }
                const parent = node.parentNode;
                if (parent) {
                    if (excludeTags.has(parent.nodeName.toLowerCase())) {
                        continue;
                    }
                    if (parent.classList && parent.classList.contains('chrome-ext-furigana-translation')) {
                        continue;
                    }
                }

                domChanged = true;
                setTimeout(function () {
                    if (!domChanged) {
                        return;
                    }
                    try {
                        scanDocument();
                    } finally {
                        domChanged = false;
                    }
                }, 100);
                return;
            }
        }
    });

    // ============== kuromoji ==============
    const tokenizerPromise = new Promise(function (resolve, reject) {
        kuromoji
            .builder({dicPath: chrome.runtime.getURL("kuromoji/dict/")})
            .build(function (err, tokenizer) {
                if (tokenizer) {
                    resolve(tokenizer);
                } else {
                    reject(err);
                }
            });
    });
    let tokenizer = null;

    // ============== init ==============
    async function init() {
        const configs = await new Promise(function (resolve) {
            chrome.storage.sync.get(resolve);
        });
        const globalDisabled = configs['globalDisabled'] || false;
        const disabledDomains = configs['disabledDomains'] || [];
        tokenizer = await tokenizerPromise;
        enableInsertRomaji = !(globalDisabled || disabledDomains.includes(location.host));
        chrome.runtime.sendMessage({type: 'current-tab-state-change', content: enableInsertRomaji});
        observer.observe(document, {childList: true, subtree: true});
        if (enableInsertRomaji) {
            scanDocument();
        }
    }

    init();

    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (!message) {
            return;
        }
        switch (message.type) {
            case 'set-enabled': {
                if (enableInsertRomaji !== message.content) {
                    enableInsertRomaji = message.content;
                    chrome.runtime.sendMessage({type: 'current-tab-state-change', content: enableInsertRomaji});
                    if (enableInsertRomaji) {
                        scanDocument();
                    } else {
                        deleteRubies();
                    }
                }
            }
                break;
            case 'is-enabled-on-tab': {
                sendResponse(enableInsertRomaji);
            }
                break;
            case 'is-actual-enabled': {
                sendResponse(enableInsertRomaji);
            }
                break;
        }
    });

    function deleteRubies() {
        const excludeTags = new Set(['script', 'select', 'textarea']);

        function scanRubyNodes(node) {
            if (excludeTags.has(node.nodeName.toLowerCase())) {
                return;
            }
            if (node.nodeName.toLowerCase() === 'ruby') {
                if (node.classList.contains('chrome-ext-furigana')) {
                    const parent = node.parentNode;
                    const textNode = Array.from(node.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
                    if (textNode) {
                        parent.replaceChild(textNode, node);
                    }
                }
                return;
            }
            if (node.hasChildNodes()) {
                node.childNodes.forEach(scanRubyNodes);
            }
        }

        scanRubyNodes(document.body);
    }

    // ============== japanese regexp ==============
    const kanaRegexp = /[ぁ-んァ-ン]/;
    const kanjiRegexp = /[\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u3005\u3007\u3021-\u3029\u3038-\u303B\u3400-\u4DB5\u4E00-\u9FCC\uF900-\uFA6D\uFA70-\uFAD9]/;

    function includesKana(text) {
        return kanaRegexp.test(text);
    }

    function includesKanji(text) {
        return kanjiRegexp.test(text);
    }

    function includesJapanese(text) {
        return includesKana(text) || includesKanji(text);
    }

    // ============== check is page chinese ==============
    let isPageChinese = false;
    if (document.documentElement.lang.includes('zh')) {
        isPageChinese = true;
    } else {
        const pageText = document.body.innerText;
        const matchKana = pageText.match(/[ぁ-んァ-ン]/g);
        const kanaNum = matchKana ? matchKana.length : 0;
        const matchChinese = pageText.match(/[\u3400-\u4DBF\u4E00-\u9FEF\u20000-\u2EBFF]/g);
        const chineseNum = matchChinese ? matchChinese.length : 0;
        isPageChinese = chineseNum && (kanaNum / chineseNum < 0.02);
    }

    // ============== scan document ==============
    function scanDocument() {
        const stack = [document.body];
        const textNodes = [];
        for (; ;) {
            const node = stack.shift();
            if (!node) {
                break;
            }
            if (node.classList && node.classList.contains('chrome-ext-furigana-translation')) {
                continue;
            }
            if (node.hasChildNodes()) {
                const childNodes = node.childNodes;
                for (let i = 0, len = childNodes.length; i < len; ++i) {
                    const child = childNodes.item(i);
                    if (!excludeTags.has(child.nodeName.toLowerCase())) {
                        stack.push(child);
                    }
                }
            } else if (node.nodeType === Node.TEXT_NODE) {
                textNodes.push(node);
            }
        }
        for (let i = 0, len = textNodes.length; i < len; ++i) {
            createRuby(textNodes[i]);
        }
    }

    // ============== create ruby ==============
    function createRuby(node) {
        const text = node.nodeValue;
        if (!(
            isPageChinese && includesKana(text) // prevent treating chinese as japanese kanji
            || !isPageChinese && includesJapanese(text)
        )) {
            return;
        }
        const tokens = tokenizer.tokenize(text);
        if (!tokens) {
            return;
        }
        if (!enableInsertRomaji) {
            return;
        }
        const parent = node.parentNode;
        if (!parent) {
            return;
        }
        for (let i = 0, len = tokens.length; i < len; ++i) {
            const token = tokens[i];

            let dom;
            if (includesKana(token.pronunciation) || includesJapanese(token.surface_form)) {
                dom = document.createElement('ruby');
                dom.classList.add('chrome-ext-furigana');
                dom.appendChild(document.createTextNode(token.surface_form));
                const rt = document.createElement('rt');
                rt.textContent = japanese.romanize(
                    includesKana(token.pronunciation) ? token.pronunciation : token.surface_form
                );
                dom.appendChild(rt);
            } else {
                dom = document.createTextNode(token.surface_form);
            }

            if (i === 0) {
                parent.replaceChild(dom, node);
            } else {
                node.after(dom);
            }
            node = dom;
        }
    }

    // ============== google translate ==============
    const googleTranslateCache = {};

    function googleTranslate(sLang, tLang, text) {
        text = (text || '').trim();
        const hash = `${tLang}/${text}`
        if (googleTranslateCache.hasOwnProperty(hash)) {
            return googleTranslateCache[hash];
        }
        return googleTranslateCache[hash] = new Promise(function (resolve) {
            const url = `https://clients5.google.com/translate_a/single?dj=1&dt=t&dt=sp&dt=ld&dt=bd&client=dict-chrome-ex&sl=${sLang}&tl=${tLang}&q=${encodeURIComponent(text)}`;
            chrome.runtime.sendMessage({type: 'fetch-json', content: url}, function (json) {
                resolve(json);
            });
        });
    }

    // ============== translation ==============
    const translationDom = document.createElement('div');
    translationDom.classList.add('chrome-ext-furigana-translation');
    document.body.appendChild(translationDom);

    // ============== get mouseover ruby ==============
    let currHoverNode = null;
    document.addEventListener('mouseover', async function (e) {
        translationDom.classList.remove('show');
        let node = e.target;
        if (!node) {
            return;
        }
        if (node.nodeName.toLowerCase() === 'rt') {
            node = node.parentNode;
        }
        currHoverNode = node;
        if (node.nodeName.toLowerCase() === 'ruby'
            && node.classList.contains('chrome-ext-furigana')
        ) {
            const configs = await new Promise(function (resolve) {
                chrome.storage.sync.get(resolve);
            });
            if (configs['translationDisabled']) {
                return;
            }

            await new Promise(function (resolve) {
                setTimeout(resolve, 200);
            });

            if (currHoverNode !== node) {
                return;
            }
            const textNode = Array.from(node.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
            if (!textNode) {
                return;
            }
            const text = textNode.data || '';
            const res = await googleTranslate('ja', configs['targetLang'] || 'en', text);
            if (res.dict?.length) {
                translationDom.innerHTML = res.dict.map(item =>
                    item.pos + ' ' + item.entry.map(item => item.word).join(', ')
                ).join('<br>');
            } else if (res.sentences?.length) {
                translationDom.innerHTML = res.sentences.map(item => item.trans).join(', `');
            } else {
                return;
            }

            const rect = node.getBoundingClientRect();
            translationDom.style.top = (rect.bottom + 2) + 'px';
            translationDom.style.left = rect.left + 'px';
            translationDom.classList.add('show');
        }
    });

    document.addEventListener('scroll', function () {
        translationDom.classList.remove('show');
    });
})();