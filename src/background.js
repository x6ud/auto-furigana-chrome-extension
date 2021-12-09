function setIcon(active) {
    chrome.action.setIcon({path: active ? 'icon.png' : 'icon-inactive.png'});
}

chrome.tabs.onActivated.addListener(function (activeInfo) {
    chrome.tabs.sendMessage(
        activeInfo.tabId,
        {type: 'is-actual-enabled'},
        function (val) {
            setIcon(val);
        }
    );
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message) {
        return;
    }
    switch (message.type) {
        case 'current-tab-state-change':
            setIcon(message.content);
            break;
        case 'fetch-json':
            fetch(message.content).then(res => res.json().then(sendResponse));
            return true;
    }
});