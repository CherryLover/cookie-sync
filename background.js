// 初始化配置
let settings = {
  autoSync: true,
  syncInterval: 60,
  notifications: true
};

// 加载保存的设置
chrome.storage.local.get(['autoSync', 'syncInterval', 'notifications']).then(savedSettings => {
  settings = { ...settings, ...savedSettings };
  updateAlarm();
});

// 更新定时任务
function updateAlarm() {
  chrome.alarms.clear('cookieSync').then(() => {
    if (settings.autoSync) {
      chrome.alarms.create('cookieSync', {
        periodInMinutes: settings.syncInterval
      });
    }
  });
}

// 监听定时任务
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cookieSync' && settings.autoSync) {
    syncCookies();
  }
});

// 重试配置
const RETRY_DELAYS = [1000, 3000, 5000]; // 重试延迟时间（毫秒）
const MAX_RETRIES = 3; // 最大重试次数

// 延迟函数
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 发送通知
function sendNotification(title, message) {
  if (settings.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message
    });
  }
}

// 同步 Cookie 的主要函数
async function syncCookies(retryCount = 0) {
  try {
    // 获取存储的配置
    const config = await chrome.storage.local.get(['domains', 'serverUrl']);
    if (!config.domains || !config.serverUrl) {
      throw new Error('配置未完成，请先设置域名和服务器地址');
    }

    const domains = config.domains.split('\n').map(d => d.trim()).filter(Boolean);
    const cookies = [];
    const errors = [];

    // 获取每个域名的 cookies
    for (const domain of domains) {
      try {
        const url = domain.startsWith('http') ? domain : `http://${domain}`;
        const domainCookies = await chrome.cookies.getAll({ url });
        
        if (domainCookies.length === 0) {
          errors.push(`警告: ${domain} 没有找到任何 Cookie`);
        }
        
        cookies.push(...domainCookies.map(cookie => ({
          ...cookie,
          domain: domain
        })));
      } catch (error) {
        errors.push(`获取 ${domain} 的 Cookie 失败: ${error.message}`);
      }
    }

    if (cookies.length === 0) {
      throw new Error('未能获取到任何 Cookie' + (errors.length ? `\n${errors.join('\n')}` : ''));
    }

    // 发送到服务器
    const response = await fetch(config.serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cookies,
        timestamp: new Date().toISOString(),
        warnings: errors.length ? errors : undefined
      })
    });

    if (!response.ok) {
      throw new Error(`服务器响应错误: ${response.status} ${response.statusText}`);
    }

    // 更新同步状态
    await chrome.storage.local.set({
      lastSync: new Date().toISOString(),
      syncStatus: 'success',
      lastError: errors.length ? errors.join('\n') : null,
      lastSyncDetails: {
        cookieCount: cookies.length,
        warnings: errors
      }
    });

    // 发送成功通知
    if (errors.length) {
      sendNotification('Cookie 同步完成（有警告）', `成功同步 ${cookies.length} 个 Cookie，但有 ${errors.length} 个警告`);
    } else {
      sendNotification('Cookie 同步成功', `成功同步 ${cookies.length} 个 Cookie`);
    }

  } catch (error) {
    console.error('同步失败:', error);

    // 检查是否需要重试
    if (retryCount < MAX_RETRIES) {
      await delay(RETRY_DELAYS[retryCount]);
      return syncCookies(retryCount + 1);
    }

    // 更新错误状态
    await chrome.storage.local.set({
      syncStatus: 'error',
      lastError: error.message
    });

    // 发送失败通知
    sendNotification('Cookie 同步失败', `同步失败: ${error.message}\n已重试 ${retryCount} 次`);
  }
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'manualSync') {
    syncCookies();
    sendResponse({ status: 'started' });
  } else if (request.action === 'updateSettings') {
    settings = { ...settings, ...request.settings };
    updateAlarm();
    sendResponse({ status: 'updated' });
  }
  return true; // 保持消息通道开放
}); 