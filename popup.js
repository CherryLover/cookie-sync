document.addEventListener('DOMContentLoaded', async () => {
  // 获取DOM元素
  const domainsTextarea = document.getElementById('domains');
  const serverInput = document.getElementById('server');
  const syncButton = document.getElementById('syncButton');
  const statusSpan = document.getElementById('status');
  const lastSyncSpan = document.getElementById('lastSync');
  const autoSyncCheckbox = document.getElementById('autoSync');
  const syncIntervalInput = document.getElementById('syncInterval');
  const notificationsCheckbox = document.getElementById('notifications');
  const saveSettingsButton = document.getElementById('saveSettings');
  const historyList = document.getElementById('historyList');
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  const toast = document.getElementById('toast');
  const intervalSettings = document.getElementById('intervalSettings');
  const testDomainInput = document.getElementById('testDomain');
  const testSingleDomainButton = document.getElementById('testSingleDomain');
  const testSavedDomainsButton = document.getElementById('testSavedDomains');
  const clearTestResultButton = document.getElementById('clearTestResult');
  const testOutput = document.getElementById('testOutput');
  const cookieCount = document.getElementById('cookieCount');

  // 显示提示信息
  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => {
      toast.className = 'toast';
    }, 3000);
  }

  // 加载所有配置
  const config = await chrome.storage.local.get([
    'domains', 'serverUrl', 'lastSync', 'syncStatus', 'lastError',
    'autoSync', 'syncInterval', 'notifications', 'syncHistory'
  ]);

  // 设置初始值
  if (config.domains) domainsTextarea.value = config.domains;
  if (config.serverUrl) serverInput.value = config.serverUrl;
  if (config.lastSync) lastSyncSpan.textContent = new Date(config.lastSync).toLocaleString();
  if (config.syncStatus) {
    updateStatus(config.syncStatus, config.lastError);
  }

  // 设置页面初始值
  autoSyncCheckbox.checked = config.autoSync !== false;
  syncIntervalInput.value = config.syncInterval || 60;
  notificationsCheckbox.checked = config.notifications !== false;

  // 更新同步间隔设置的状态
  function updateIntervalSettings() {
    if (autoSyncCheckbox.checked) {
      intervalSettings.classList.add('active');
    } else {
      intervalSettings.classList.remove('active');
    }
  }

  // 初始化同步间隔设置的状态
  updateIntervalSettings();

  // 监听自动同步复选框变化
  autoSyncCheckbox.addEventListener('change', updateIntervalSettings);

  // 加载历史记录
  updateHistoryList(config.syncHistory || []);

  // 标签切换
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  // 验证单个域名格式
  function isValidDomain(domain) {
    if (!domain) return false;
    const domainWithoutProtocol = domain.replace(/^https?:\/\//, '');
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domainWithoutProtocol);
  }

  // 验证服务器地址
  function isValidServerUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // 验证所有输入
  function validateInput() {
    const domains = domainsTextarea.value.trim().split('\n').filter(Boolean);
    const serverUrl = serverInput.value.trim();

    if (domains.length === 0) {
      throw new Error('请输入至少一个域名');
    }

    const invalidDomains = domains.filter(domain => !isValidDomain(domain));
    if (invalidDomains.length > 0) {
      throw new Error(`以下域名格式无效：\n${invalidDomains.join('\n')}`);
    }

    if (!isValidServerUrl(serverUrl)) {
      throw new Error('服务器地址格式无效，请输入正确的 HTTP(S) URL');
    }

    return { domains, serverUrl };
  }

  // 更新状态显示
  function updateStatus(status, error = '') {
    switch (status) {
      case 'success':
        statusSpan.textContent = '同步成功';
        statusSpan.style.color = '#4CAF50';
        break;
      case 'error':
        statusSpan.textContent = `同步失败: ${error}`;
        statusSpan.style.color = '#f44336';
        break;
      case 'syncing':
        statusSpan.textContent = '同步中...';
        statusSpan.style.color = '#2196F3';
        break;
      default:
        statusSpan.textContent = '未同步';
        statusSpan.style.color = '';
    }
  }

  // 更新历史记录列表
  function updateHistoryList(history = []) {
    historyList.innerHTML = '';
    history.slice(-10).reverse().forEach(item => {
      const div = document.createElement('div');
      div.className = `history-item ${item.status}`;
      div.innerHTML = `
        <div><strong>${new Date(item.timestamp).toLocaleString()}</strong></div>
        <div>状态: ${item.status === 'success' ? '成功' : '失败'}</div>
        ${item.error ? `<div>错误: ${item.error}</div>` : ''}
        ${item.cookieCount ? `<div>同步Cookie数量: ${item.cookieCount}</div>` : ''}
      `;
      historyList.appendChild(div);
    });
  }

  // 添加历史记录
  async function addHistoryRecord(record) {
    const history = (await chrome.storage.local.get('syncHistory')).syncHistory || [];
    history.push(record);
    
    // 只保留最近20条记录
    if (history.length > 20) {
      history.shift();
    }
    
    await chrome.storage.local.set({ syncHistory: history });
    updateHistoryList(history);
  }

  // 保存配置的函数
  async function saveConfig() {
    try {
      const { domains, serverUrl } = validateInput();
      await chrome.storage.local.set({
        domains: domains.join('\n'),
        serverUrl
      });
      showToast('配置已自动保存');
      return true;
    } catch (error) {
      updateStatus('error', error.message);
      return false;
    }
  }

  // 自动保存配置（使用防抖）
  let saveTimeout;
  function debouncedSave() {
    clearTimeout(saveTimeout);
    // 增加延迟到 1000ms，给用户更多输入时间
    saveTimeout = setTimeout(saveConfig, 1000);
  }

  // 监听输入变化，自动保存配置
  domainsTextarea.addEventListener('input', debouncedSave);
  serverInput.addEventListener('input', debouncedSave);

  // 保存设置
  saveSettingsButton.addEventListener('click', async () => {
    const interval = parseInt(syncIntervalInput.value, 10);
    if (interval < 1 || interval > 1440) {
      showToast('同步间隔必须在1-1440分钟之间', true);
      return;
    }

    await chrome.storage.local.set({
      autoSync: autoSyncCheckbox.checked,
      syncInterval: interval,
      notifications: notificationsCheckbox.checked
    });

    // 通知后台更新定时任务
    chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: {
        autoSync: autoSyncCheckbox.checked,
        syncInterval: interval,
        notifications: notificationsCheckbox.checked
      }
    });

    showToast('设置已保存');
  });

  // 手动同步按钮点击事件
  syncButton.addEventListener('click', async () => {
    try {
      // 取消之前的延迟保存
      clearTimeout(saveTimeout);
      
      // 立即保存配置
      if (!await saveConfig()) {
        return;
      }

      // 更新状态
      updateStatus('syncing');
      syncButton.disabled = true;

      // 发送同步请求给后台脚本
      chrome.runtime.sendMessage({ 
        action: 'manualSync',
        config: {
          domains: domainsTextarea.value.trim(),
          serverUrl: serverInput.value.trim()
        }
      }, (response) => {
        if (response.status === 'started') {
          // 定期检查同步状态
          const checkStatus = setInterval(async () => {
            const status = await chrome.storage.local.get(['syncStatus', 'lastSync', 'lastError', 'lastSyncDetails']);
            if (status.syncStatus === 'success') {
              updateStatus('success');
              lastSyncSpan.textContent = new Date(status.lastSync).toLocaleString();
              clearInterval(checkStatus);
              syncButton.disabled = false;

              // 添加成功记录
              addHistoryRecord({
                timestamp: status.lastSync,
                status: 'success',
                cookieCount: status.lastSyncDetails?.cookieCount
              });
            } else if (status.syncStatus === 'error') {
              updateStatus('error', status.lastError);
              clearInterval(checkStatus);
              syncButton.disabled = false;

              // 添加失败记录
              addHistoryRecord({
                timestamp: new Date().toISOString(),
                status: 'error',
                error: status.lastError
              });
            }
          }, 1000);

          // 设置超时检查
          setTimeout(() => {
            clearInterval(checkStatus);
            if (syncButton.disabled) {
              syncButton.disabled = false;
              updateStatus('error', '同步超时，请重试');
              
              // 添加超时记录
              addHistoryRecord({
                timestamp: new Date().toISOString(),
                status: 'error',
                error: '同步超时'
              });
            }
          }, 30000); // 30秒超时
        }
      });
    } catch (error) {
      updateStatus('error', error.message);
    }
  });

  // 格式化 Cookie 数据
  function formatCookie(cookie) {
    // 提取 Cookie 的字段信息
    const fields = new Set();
    Object.keys(cookie).forEach(key => {
      if (cookie[key] !== undefined && cookie[key] !== '') {
        fields.add(key);
      }
    });

    return {
      fields: Array.from(fields),
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      expirationDate: cookie.expirationDate
    };
  }

  // 获取单个域名的 Cookie
  async function getCookiesForDomain(domain) {
    try {
      const url = domain.startsWith('http') ? domain : `http://${domain}`;
      const cookies = await chrome.cookies.getAll({ url });
      return {
        success: true,
        domain,
        cookies: cookies,
        cookieInfo: cookies.map(formatCookie)
      };
    } catch (error) {
      return {
        success: false,
        domain,
        error: error.message
      };
    }
  }

  // 创建域名结果 DOM 元素
  function createDomainResultElement(result) {
    const div = document.createElement('div');
    div.className = 'domain-result' + (result.success ? '' : ' error');

    if (result.success) {
      // 生成 Cookie 字符串
      function generateCookieString(cookies) {
        return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
      }

      // 获取所有 Cookie 字段名称
      const cookieFields = [...new Set(result.cookieInfo.flatMap(cookie => Object.keys(cookie)))];
      
      div.innerHTML = `
        <div class="domain-header">
          <div class="domain-summary">
            <span class="domain-name">${result.domain}</span>
            <span class="cookie-count">${result.cookies.length} 个 Cookie</span>
            <span class="cookie-fields">字段：${cookieFields.join('、')}</span>
          </div>
          <button class="copy-button" title="复制 Cookie">复制</button>
        </div>
      `;

      // 添加复制功能
      const copyButton = div.querySelector('.copy-button');
      copyButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        const cookieString = generateCookieString(result.cookies);
        try {
          await navigator.clipboard.writeText(cookieString);
          showToast('Cookie 已复制到剪贴板');
        } catch (error) {
          showToast('复制失败: ' + error.message, true);
        }
      });
    } else {
      div.innerHTML = `
        <div class="domain-header">
          <div class="domain-summary">
            <div class="domain-title">
              <span class="domain-name">${result.domain}</span>
              <span class="error-message">获取失败: ${result.error}</span>
            </div>
          </div>
        </div>
      `;
    }

    return div;
  }

  // 分析 Cookie 数据
  function analyzeCookies(cookies) {
    const stats = {
      fields: new Set(),
      secureCount: 0,
      httpOnlyCount: 0,
      sessionCount: 0,
      persistentCount: 0
    };

    cookies.forEach(cookie => {
      // 收集所有字段
      Object.keys(cookie).forEach(key => {
        if (cookie[key] !== undefined && cookie[key] !== '') {
          stats.fields.add(key);
        }
      });

      // 统计安全属性
      if (cookie.secure) stats.secureCount++;
      if (cookie.httpOnly) stats.httpOnlyCount++;

      // 统计过期时间
      if (cookie.expirationDate) {
        stats.persistentCount++;
      } else {
        stats.sessionCount++;
      }
    });

    return {
      ...stats,
      fields: Array.from(stats.fields)
    };
  }

  // 格式化字段统计信息
  function formatFieldStats(fields) {
    return fields.join(', ');
  }

  // 更新测试结果显示
  function updateTestResult(results) {
    testOutput.innerHTML = '';
    const resultArray = Array.isArray(results) ? results : [results];
    
    // 计算总体统计
    let totalDomains = resultArray.length;
    let successDomains = resultArray.filter(r => r.success).length;
    let totalCookies = resultArray.reduce((sum, r) => sum + (r.success ? r.cookies.length : 0), 0);

    // 更新统计信息
    cookieCount.innerHTML = `
      <div class="test-summary">
        <div class="summary-item">域名总数<br>${totalDomains} 个</div>
        <div class="summary-item">成功数<br>${successDomains} 个</div>
        <div class="summary-item">总 Cookie 数<br>${totalCookies} 个</div>
      </div>
    `;

    // 创建结果列表容器
    const resultList = document.createElement('div');
    resultList.className = 'test-result-list';

    // 添加每个域名的结果
    resultArray.forEach(result => {
      const resultCard = createDomainResultElement(result);
      resultList.appendChild(resultCard);
    });

    testOutput.appendChild(resultList);
  }

  // 测试单个域名
  testSingleDomainButton.addEventListener('click', async () => {
    const domain = testDomainInput.value.trim();
    if (!domain) {
      showToast('请输入要测试的域名', true);
      return;
    }

    if (!isValidDomain(domain)) {
      showToast('域名格式无效', true);
      return;
    }

    testSingleDomainButton.disabled = true;
    try {
      const result = await getCookiesForDomain(domain);
      updateTestResult(result);
    } catch (error) {
      // 创建错误结果对象
      const errorResult = {
        success: false,
        domain: domain,
        error: error.message
      };
      updateTestResult(errorResult);
    } finally {
      testSingleDomainButton.disabled = false;
    }
  });

  // 测试所有保存的域名
  testSavedDomainsButton.addEventListener('click', async () => {
    const config = await chrome.storage.local.get(['domains']);
    if (!config.domains) {
      showToast('没有保存的域名', true);
      return;
    }

    const domains = config.domains.split('\n').map(d => d.trim()).filter(Boolean);
    if (domains.length === 0) {
      showToast('没有保存的域名', true);
      return;
    }

    testSavedDomainsButton.disabled = true;
    try {
      const results = await Promise.all(
        domains.map(async (domain) => {
          try {
            return await getCookiesForDomain(domain);
          } catch (error) {
            return {
              success: false,
              domain: domain,
              error: error.message
            };
          }
        })
      );
      updateTestResult(results);
    } catch (error) {
      // 如果是整体执行出错，显示为单个错误结果
      const errorResult = {
        success: false,
        domain: '测试执行错误',
        error: error.message
      };
      updateTestResult([errorResult]);
    } finally {
      testSavedDomainsButton.disabled = false;
    }
  });

  // 清除测试结果
  clearTestResultButton.addEventListener('click', () => {
    testOutput.textContent = '';
    cookieCount.textContent = '';
    testDomainInput.value = '';
  });
}); 