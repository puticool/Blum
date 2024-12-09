const axios = require('axios');
const fs = require('fs');
const path = require('path');
const colors = require('colors');
const readline = require('readline');
const { DateTime, Duration } = require('luxon');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { HttpsProxyAgent } = require('https-proxy-agent');

class GameBot {
  constructor(queryId, accountIndex, proxy) {
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.token = null;
    this.userInfo = null;
    this.currentGameId = null;
    this.firstAccountEndTime = null;
    this.taskKeywords = null;
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
    ];
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  async randomDelay() {
    const delay = Math.floor(Math.random() * (6000 - 3000 + 1)) + 3000;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  async log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logFormat = `${timestamp} | ${type.toUpperCase()} | ${msg}`;
    
    switch(type) {
        case 'success':
            console.log(logFormat.green);
            break;
        case 'custom':
            console.log(logFormat.magenta);
            break;        
        case 'error':
            console.log(logFormat.red);
            break;
        case 'warning':
            console.log(logFormat.yellow);
            break;
        default:
            console.log(logFormat.blue);
    }
    await this.randomDelay();
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get('https://api.ipify.org?format=json', { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
        await this.log(`Using proxy IP: ${this.proxyIP}`, 'info');
      } else {
        throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      await this.log(`Error when checking proxy IP: ${error.message}`, 'error');
    }
  }

  async headers(token = null) {
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      'origin': 'https://telegram.blum.codes',
      'referer': 'https://telegram.blum.codes/',
      'user-agent': this.getRandomUserAgent(),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async makeRequest(method, url, data = null, useToken = false) {
    const config = {
      method: method,
      url: url,
      headers: await this.headers(useToken ? this.token : null),
      httpsAgent: new HttpsProxyAgent(this.proxy)
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async getNewToken() {
    const url = 'https://user-domain.blum.codes/api/v1/auth/provider/PROVIDER_TELEGRAM_MINI_APP';
    const data = JSON.stringify({ query: this.queryId, referralToken: "", });

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.randomDelay();
        const response = await this.makeRequest('post', url, data);
        this.token = response.token.refresh;
        return this.token;
      } catch (error) {
        await this.log(`Failed to get token, retrying attempt ${attempt}: ${error.message}`, 'error');
      }
    }
    await this.log('Failed to get token after 3 attempts.', 'error');
    return null;
  }

  async getUserInfo() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('get', 'https://user-domain.blum.codes/api/v1/user/me', null, true);
      this.userInfo = response;
      return this.userInfo;
    } catch (error) {
      await this.log(`Cannot retrieve user information: ${error.message}`, 'error');
      return null;
    }
  }

  async getBalance() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('get', 'https://game-domain.blum.codes/api/v1/user/balance', null, true);
      return response;
    } catch (error) {
      await this.log(`Cannot retrieve balance information: ${error.message}`, 'error');
      return null;
    }
  }

  async playGame() {
    const data = JSON.stringify({ game: 'example_game' });
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', 'https://game-domain.blum.codes/api/v1/game/play', data, true);
      this.currentGameId = response.gameId;
      return response;
    } catch (error) {
      return null;
    }
  }

  async claimGame(points) {
    if (!this.currentGameId) {
      await this.log('No current gameId to claim.', 'warning');
      return null;
    }

    const data = JSON.stringify({ gameId: this.currentGameId, points: points });
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', 'https://game-domain.blum.codes/api/v1/game/claim', data, true);
      return response;
    } catch (error) {
      await this.log(`Cannot claim game reward: ${error.message}`, 'error');
      return null;
    }
  }

  async claimBalance() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', 'https://game-domain.blum.codes/api/v1/farming/claim', {}, true);
      return response;
    } catch (error) {
      await this.log(`Cannot claim balance: ${error.message}`, 'error');
      return null;
    }
  }

  async startFarming() {
    const data = JSON.stringify({ action: 'start_farming' });
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', 'https://game-domain.blum.codes/api/v1/farming/start', data, true);
      return response;
    } catch (error) {
      await this.log(`Cannot start farming: ${error.message}`, 'error');
      return null;
    }
  }

  async checkBalanceFriend() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('get', 'https://user-domain.blum.codes/api/v1/friends/balance', null, true);
      return response;
    } catch (error) {
      await this.log(`Cannot check friend balance: ${error.message}`, 'error');
      return null;
    }
  }

  async claimBalanceFriend() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', 'https://user-domain.blum.codes/api/v1/friends/claim', {}, true);
      return response;
    } catch (error) {
      await this.log(`Cannot receive friend balance!`, 'error');
      return null;
    }
  }

  async checkDailyReward() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', 'https://game-domain.blum.codes/api/v1/daily-reward?offset=-420', {}, true);
      return response;
    } catch (error) {
      await this.log(`Cannot claim daily reward: ${error.message}`, 'error');
      return null;
    }
  }

  async Countdown(seconds) {
    for (let i = Math.floor(seconds); i >= 0; i--) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`${`[Tài khoản ${this.accountIndex + 1}]`.padEnd(15)} [*] Chờ ${i} giây để tiếp tục...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('');
  }

  async getTasks() {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('get', 'https://earn-domain.blum.codes/api/v1/tasks', null, true);
      return response;
    } catch (error) {
      await this.log(`Cannot retrieve task list: ${error.message}`, 'error');
      return [];
    }
  }

  async startTask(taskId) {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', `https://earn-domain.blum.codes/api/v1/tasks/${taskId}/start`, {}, true);
      return response;
    } catch (error) {
      await this.log(`Cannot start task ${taskId} after ${maxAttempts} attempts`, 'error');
      return null;
    }
  }

  async claimTask(taskId) {
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', `https://earn-domain.blum.codes/api/v1/tasks/${taskId}/claim`, {}, true);
      return response;
    } catch (error) {
      await this.log(`Error validating task ${taskId}: ${error.message}`, 'error');
      return null;
    }
  }

  async getTaskKeywords() {
    try {
      const response = await axios.get('https://raw.githubusercontent.com/dancayairdrop/blum/main/nv.json');
      const data = response.data;
  
      if (data && data.tasks && Array.isArray(data.tasks)) {
        this.taskKeywords = data.tasks.reduce((acc, item) => {
          if (item.id && item.keyword) {
            acc[item.id] = item.keyword;
          }
          return acc;
        }, {});
      }
    } catch (error) {
      this.taskKeywords = {};
    }
  }

  async validateTask(taskId, keyword) {
    try {
      const payload = { keyword: keyword };
      await this.randomDelay();
      const response = await this.makeRequest('post', `https://earn-domain.blum.codes/api/v1/tasks/${taskId}/validate`, { payload }, true);
      return response;
    } catch (error) {
      await this.log(`Error validating task ${taskId}: ${error.message}`, 'error');
      return null;
    }
  }
  
  async joinTribe(tribeId) {
    const url = `https:///tribe-domain.blum.codes/api/v1/tribe/${tribeId}/join`;
    try {
      await this.randomDelay();
      const response = await this.makeRequest('post', url, {}, true);
      if (response) {
        await this.log('You have successfully joined the tribe', 'success');
        return true;
      }
    } catch (error) {
      if (error.response && error.response.data && error.response.data.message === 'USER_ALREADY_IN_TRIBE') {
      } else {
        await this.log(`Cannot join tribe: ${error.message}`, 'error');
      }
      return false;
    }
  }

  async runAccount() {
    try {
      await this.checkProxyIP();
      
      let remainingFarmingTime = null;
    
      const token = await this.getNewToken();
      if (!token) {
        await this.log('Cannot get token, skipping this account', 'error');
        return Duration.fromMillis(0);
      }
    
      const userInfo = await this.getUserInfo();
      if (userInfo === null) {
        await this.log('Cannot retrieve user information, skipping this account', 'error');
        return Duration.fromMillis(0);
      }
    
      await this.log(`Starting to process account ${userInfo.username}`, 'info');
      
      const balanceInfo = await this.getBalance();
      if (balanceInfo) {
        await this.log(`Số dư: ${balanceInfo.availableBalance} | Game : ${balanceInfo.playPasses}`, 'success');
    
        const tribeId = 'b372af40-6e97-4782-b70d-4fc7ea435022';
        await this.joinTribe(tribeId);
        
        if (!balanceInfo.farming) {
          const farmingResult = await this.startFarming();
          if (farmingResult) {
            await this.log('Successfully started farming!', 'success');
            remainingFarmingTime = Duration.fromObject({ hours: 8 });
          }
        } else {
          const endTime = DateTime.fromMillis(balanceInfo.farming.endTime);
          const formattedEndTime = endTime.setZone('Asia/Ho_Chi_Minh').toFormat('dd/MM/yyyy HH:mm:ss');
          const currentTime = DateTime.now();
          if (currentTime > endTime) {
            const claimBalanceResult = await this.claimBalance();
            if (claimBalanceResult) {
              await this.log('Claim farm thành công!', 'success');
            }
    
            const farmingResult = await this.startFarming();
            if (farmingResult) {
              await this.log('Successfully started farming!', 'success');
              remainingFarmingTime = Duration.fromObject({ hours: 8 });
            }
          } else {
            remainingFarmingTime = endTime.diff(currentTime);
            const timeLeft = remainingFarmingTime.toFormat('hh:mm:ss');
            await this.log(`Time remaining for farming: ${timeLeft}`, 'info');
          }
        }
      } else {
        await this.log('Cannot retrieve balance information', 'error');
      }
      await this.getTaskKeywords();
      const dataTasks = await this.getTasks();
      if (Array.isArray(dataTasks) && dataTasks.length > 0) {
        let allTasks = [];
        const processTask = (task) => {
          allTasks.push(task);
          if (task.subTasks && Array.isArray(task.subTasks)) {
            task.subTasks.forEach(processTask);
          }
        };

        for (const section of dataTasks) {
          if (section.tasks && Array.isArray(section.tasks)) {
            section.tasks.forEach(processTask);
          }
          if (section.subSections && Array.isArray(section.subSections)) {
            for (const subSection of section.subSections) {
              if (subSection.tasks && Array.isArray(subSection.tasks)) {
                subSection.tasks.forEach(processTask);
              }
            }
          }
        }

        const skipTasks = [
          "5daf7250-76cc-4851-ac44-4c7fdcfe5994",
          "3b0ae076-9a85-4090-af55-d9f6c9463b2b",
          "89710917-9352-450d-b96e-356403fc16e0",
          "220ee7b1-cca4-4af8-838a-2001cb42b813",
          "c4e04f2e-bbf5-4e31-917b-8bfa7c4aa3aa",
          "f382ec3f-089d-46de-b921-b92adfd3327a",
          "d3716390-ce5b-4c26-b82e-e45ea7eba258",
          "5ecf9c15-d477-420b-badf-058537489524",
          "d057e7b7-69d3-4c15-bef3-b300f9fb7e31",
          "a4ba4078-e9e2-4d16-a834-02efe22992e2",
          "39391eb2-f031-4954-bd8a-e7aecbb1f192",
          "d7accab9-f987-44fc-a70b-e414004e8314"
        ];

        const taskFilter = allTasks.filter(
          (task) =>
            !skipTasks.includes(task.id) &&
            task.status !== "FINISHED" &&
            !task.isHidden
        );

        for (const task of taskFilter) {
          switch (task.status) {
            case "READY_FOR_CLAIM":
              const claimResult = await this.claimTask(task.id);
              if (claimResult && claimResult.status === "FINISHED") {
                await this.log(`Đã nhận phần thưởng cho nhiệm vụ: ${task.title.yellow}`, 'success');
              }
              break;

            case "READY_FOR_VERIFY":
              if (task.validationType === "KEYWORD") {
                const keyword = this.taskKeywords[task.id];
                if (keyword) {
                  const validateResult = await this.validateTask(task.id, keyword);
                  if (!validateResult) {
                    continue;
                  }
                } else {
                  await this.log(`Task ${task.title} chưa có câu trả lời nên bỏ qua`, 'warning');
                  continue;
                }
              }
              
              const claimResultAfterVerify = await this.claimTask(task.id);
              if (claimResultAfterVerify && claimResultAfterVerify.status === "FINISHED") {
                await this.log(`Làm nhiệm vụ ${task.title.yellow}${`... trạng thái: thành công!`.green}`, 'success');
              }
              break;

            default:
              const startResult = await this.startTask(task.id);
              if (startResult) {
                await this.log(`Đã bắt đầu nhiệm vụ: ${task.title}`, 'success');
              } else {
                continue;
              }
              
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              if (task.validationType === "KEYWORD") {
                const keyword = this.taskKeywords[task.id];
                if (keyword) {
                  const validateResult = await this.validateTask(task.id, keyword);
                  if (!validateResult) {
                    continue;
                  }
                } else {
                  await this.log(`Task ${task.title} chưa có câu trả lời nên bỏ qua`, 'warning');
                  continue;
                }
              }
              
              const claimResultDefault = await this.claimTask(task.id);
              if (claimResultDefault && claimResultDefault.status === "FINISHED") {
                await this.log(`Làm nhiệm vụ ${task.title.yellow}${`... trạng thái: thành công!`.green}`, 'success');
              }
              break;
          }
        }
      } else {
        await this.log('Cannot retrieve task list or task list is empty', 'error');
      }
    
      const dailyRewardResult = await this.checkDailyReward();
      if (dailyRewardResult) {
        await this.log('Successfully claimed daily reward!', 'success');
      }
    
      const friendBalanceInfo = await this.checkBalanceFriend();
      if (friendBalanceInfo) {
        if (friendBalanceInfo.amountForClaim > 0) {
          await this.log(`Số dư bạn bè: ${friendBalanceInfo.amountForClaim}`, 'info');
          const claimFriendBalanceResult = await this.claimBalanceFriend();
          if (claimFriendBalanceResult) {
            await this.log('Successfully claimed friend balance!', 'success');
          }
        }
      } else {
        await this.log('Cannot check friend balance!', 'error');
      }
      
      if (balanceInfo && balanceInfo.playPasses > 999999) {
        for (let j = 0; j < balanceInfo.playPasses; j++) {
          let playAttempts = 0;
          const maxAttempts = 10;
      
          while (playAttempts < maxAttempts) {
            try {
              const playResult = await this.playGame();
              if (playResult) {
                await this.log(`Starting game play #${j + 1}...`, 'success');
                await new Promise(resolve => setTimeout(resolve, 30000));
                const randomNumber = Math.floor(Math.random() * (200 - 150 + 1)) + 150;
                const claimGameResult = await this.claimGame(randomNumber);
                if (claimGameResult) {
                  await this.log(`Successfully claimed game reward for play #${j + 1} with ${randomNumber} points!`, 'success');
                }
                break;
              }
            } catch (error) {
              playAttempts++;
              await this.log(`Cannot play game #${j + 1}, attempt ${playAttempts}: ${error.message}`, 'warning');
              if (playAttempts < maxAttempts) {
                await this.log(`Retrying...`, 'info');
                await this.Countdown(5);
              } else {
                await this.log(`Failed after ${maxAttempts} attempts, skipping this game play`, 'error');
              }
            }
          }
        }
      }
    
      await this.log(`Finished processing account ${userInfo.username}`, 'success');
    
      return remainingFarmingTime || Duration.fromMillis(0);
    } catch (error) {
      await this.log(`Unknown error while processing account: ${error.message}`, 'error');
      return Duration.fromMillis(0);
    }
  }
}

async function runWorker(workerData) {
  const { queryId, accountIndex, proxy } = workerData;
  const gameBot = new GameBot(queryId, accountIndex, proxy);
  try {
    const remainingTime = await Promise.race([
      gameBot.runAccount(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10 * 60 * 1000))
    ]);
    parentPort.postMessage({ accountIndex, remainingTime: remainingTime.as('seconds') });
  } catch (error) {
    parentPort.postMessage({ accountIndex, error: error.message });
  }
}

async function main() {
  const dataFile = path.join(__dirname, 'data.txt');
  const proxyFile = path.join(__dirname, 'proxy.txt');
  const queryIds = fs.readFileSync(dataFile, 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter(Boolean);
  const proxies = fs.readFileSync(proxyFile, 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter(Boolean);

  const maxThreads = 10;

  if (queryIds.length !== proxies.length) {
    console.error('	The number of proxies and data must be equal.'.red);
    console.log(`Data: ${queryIds.length}`);
    console.log(`Proxy: ${proxies.length}`);
    process.exit(1);
  }

  while (true) {
    let currentIndex = 0;
    let minRemainingTime = Infinity;
    const errors = [];

    while (currentIndex < queryIds.length) {
      const workerPromises = [];

      const batchSize = Math.min(maxThreads, queryIds.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: { 
            queryId: queryIds[currentIndex], 
            accountIndex: currentIndex,
            proxy: proxies[currentIndex % proxies.length]
          }
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on('message', (message) => {
              if (message.error) {
                errors.push(`Account ${message.accountIndex}: ${message.error}`);
              } else {
                const { remainingTime } = message;
                if (remainingTime < minRemainingTime) {
                  minRemainingTime = remainingTime;
                }
              }
              resolve();
            });
            worker.on('error', (error) => {
              errors.push(`Worker error for account ${currentIndex}: ${error.message}`);
              resolve();
            });
            worker.on('exit', (code) => {
              if (code !== 0) {
                errors.push(`Worker for account ${currentIndex} exited with code: ${code}`);
              }
              resolve();
            });
          })
        );

        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }

      if (currentIndex < queryIds.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const gameBot = new GameBot(null, 0, proxies[0]);
    await gameBot.Countdown(28900);
  }
}

if (isMainThread) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}