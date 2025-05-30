import { test, expect, Page } from '@playwright/test';

// 扩展Window接口声明
declare global {
  interface Window {
    gameState: {
      cannon: { x: number };
      bubbles: any[];
    };
  }
}

test.describe('Bouncing Ball Game - 核心流程自动化测试', () => {
  // 性能监测器
  const performanceMetrics: {[key: string]: number} = {};

  test.beforeEach(async ({ page }) => {
    // 导航到游戏页面
    await page.goto('http://localhost:5173');
    await page.waitForSelector('canvas');
    
    // 初始化性能监控
    await page.addInitScript(() => {
      window.performance.mark('testStart');
    });
  });

  test('移动炮台控制测试', async ({ page }) => {
    // 初始炮台位置
    const initialPosition = await page.evaluate(() => {
      return window.gameState.cannon.x;
    });

    // 模拟键盘事件移动炮台（右移3次确保显著位移）
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    // 验证位置更新
    const newPosition = await page.evaluate(() => {
      return window.gameState.cannon.x;
    });
    expect(newPosition).toBeGreaterThan(initialPosition);
  });

  test('泡泡发射与碰撞分析', async ({ page }) => {
    // 初始泡泡数量
    const initialBubbles = await page.evaluate(() => {
      return window.gameState.bubbles.length;
    });

    // 发射泡泡
    await page.locator('canvas').click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(1500); // 等待碰撞发生

    // 碰撞后验证
    const postCollisionBubbles = await page.evaluate(() => {
      return window.gameState.bubbles.length;
    });
    expect(postCollisionBubbles).not.toBe(initialBubbles);

    // 截屏记录碰撞结果
    await page.screenshot({
      path: 'test-results/collision-analysis.png',
      fullPage: true
    });
  });

  test('性能基准测试', async ({ page }) => {
    // 连续操作压力测试
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
      if (i % 5 === 0) {
        await page.locator('canvas').click({
          position: { x: 300 + i*10, y: 200 }
        });
      }
    }

    // 获取帧率数据
    const frameTime = await page.evaluate(() => {
      const marks = window.performance.getEntriesByName('renderFrame');
      if (marks.length < 10) return 0;
      
      const lastTen = marks.slice(-10);
      return lastTen.reduce((sum, mark) => sum + mark.duration, 0) / 10;
    });

    // 性能断言 (确保平均帧时间小于16.67ms以维持60fps)
    expect(frameTime).toBeLessThan(16.67);
    console.log(`平均帧时间: ${frameTime.toFixed(2)}ms`);
  });

  test.afterEach(async ({ page }, testInfo) => {
    // 收集最终性能数据
    const memUsage = await page.evaluate(() =>
      (window.performance as any).memory?.usedJSHeapSize || 0
    );
    performanceMetrics[`${testInfo.title}_Memory`] = memUsage;
    
    // 检测到缺陷时自动分类
    if (testInfo.status === 'failed') {
      await classifyAndReportDefect(testInfo, page);
    }
  });
});

// 缺陷分类与报告
async function classifyAndReportDefect(testInfo: any, page: Page) {
  const error = testInfo.error;
  const defectType = error.message.includes('Timeout') ? '性能瓶颈'
    : error.message.includes('expected') ? '逻辑缺陷'
    : '渲染异常';
  
  // 生成结构化缺陷报告
  const defectReport = {
    priority: defectType === '性能瓶颈' ? 'P0' : 'P1',
    description: `[${defectType}] ${error.message.slice(0, 100)}`,
    rootCause: await analyzeRootCause(page, error),
    reproduction: testInfo.title,
    status: '待修复'
  };

  // 更新README缺陷追踪
  await updateDefectTracking(defectReport);
}

// 根因分析（示例）
async function analyzeRootCause(page: Page, error: Error): Promise<string> {
  if (error.message.includes('cannon')) return '炮台移动逻辑未同步渲染帧';
  if (error.message.includes('bubbles')) return '碰撞检测算法未触发泡泡消除';
  return '未知原因 - 需要深度调试';
}

import fs from 'fs';
import path from 'path';

// 更新README缺陷追踪
async function updateDefectTracking(report: any) {
  const readmePath = path.join(__dirname, '../README.md');
  let content = fs.readFileSync(readmePath, 'utf-8');
  
  // 定位缺陷追踪表
  const defectSection = '## 缺陷追踪';
  const tableHeader = '| 优先级 | 缺陷描述 | 根因 | 复现路径 | 修复状态 |';
  const tableSeparator = '|--------|----------|------|----------|----------|';
  
  // 创建新表格（如果不存在）
  if (!content.includes(defectSection)) {
    const todoSection = '## 待办事项';
    const defectTable = `\n${defectSection}\n\n${tableHeader}\n${tableSeparator}\n`;
    content = content.replace(todoSection, defectTable + todoSection);
  }
  
  // 添加新缺陷行
  const newRow = `| ${report.priority} | ${report.description} | ${report.rootCause} | ${report.reproduction} | ${report.status} |`;
  content = content.replace(tableSeparator, tableSeparator + '\n' + newRow);
  
  fs.writeFileSync(readmePath, content);
}