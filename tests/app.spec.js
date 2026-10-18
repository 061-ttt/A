// @ts-check
// Volley Lens のブラウザ操作テスト。
// 実際のブラウザ（Chromium）で画面を操作し、記録・分析・保存・公開設定までを確かめます。
const { test, expect } = require('@playwright/test');

const mine = (page) => page.locator('#score-mine');
const theirs = (page) => page.locator('#score-theirs');

/** 得点・失点を1つ記録する */
async function record(page, type, reason, { bonus = false } = {}) {
  await page.locator(type === 'score' ? '.action-score' : '.action-fault').click();
  const sheet = page.locator('#sheet-root .sheet');
  await expect(sheet).toBeVisible();
  if (bonus) await page.locator('#bonus-check').check();
  await sheet.locator(`.reason-btn[data-id="${reason}"]`).click();
  await expect(page.locator('#sheet-root .sheet')).toHaveCount(0);
}

/** ページ内の確認ダイアログで「OK側」のボタンを押す */
async function confirmDialog(page) {
  const ok = page.locator('#dialog-root [data-dialog="ok"]');
  await expect(ok).toBeVisible();
  await ok.click();
  await expect(page.locator('#dialog-root .sheet')).toHaveCount(0);
}

async function openTab(page, id) {
  await page.locator(`.nav-item[data-id="${id}"]`).click();
  await expect(page.locator(`.nav-item[data-id="${id}"]`)).toHaveAttribute('aria-current', 'page');
}

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('./');
  await expect(page.locator('.brand-name')).toBeVisible();
});
test.afterEach(async () => {
  expect(errors, 'ページでエラーが出ていないこと').toEqual([]);
});

test.describe('初期表示', () => {
  test('タイトル・空の状態・メニューが表示される', async ({ page }) => {
    await expect(page).toHaveTitle('Volley Lens');
    await expect(page.locator('.empty h3')).toHaveText('まだプレーのきろくはありません');
    await expect(page.locator('.nav-item')).toHaveCount(4);
    await expect(page.locator('.nav-item[data-id="record"]')).toHaveAttribute('aria-current', 'page');
    await expect(mine(page)).toHaveText('0');
    await expect(theirs(page)).toHaveText('0');
    await expect(page.locator('#sync-pill')).toContainText('この端末に保存');
  });

  test('サンプル試合を読み込める', async ({ page }) => {
    await page.locator('[data-action="load-sample"]').click();
    await expect(page.locator('.page-intro h1')).toContainText('サンプル');
    await expect(mine(page)).toHaveText('9');
    await expect(theirs(page)).toHaveText('5');
    await expect(page.locator('.entry-wrap')).toHaveCount(12);
  });
});

test.describe('記録', () => {
  test('記録シートに「つないだ回数」の入力がない', async ({ page }) => {
    await page.locator('.action-score').click();
    await expect(page.locator('#sheet-root .sheet')).toBeVisible();
    await expect(page.locator('.chain-picker')).toHaveCount(0);
    await expect(page.locator('#sheet-root')).not.toContainText('何回ボールをつないだ');
    await expect(page.locator('.reason-btn')).toHaveCount(5);
    await expect(page.locator('#app')).not.toContainText('つないだ回数');
  });

  test('得点を記録するとスコアと一覧が増え、紙吹雪が出る', async ({ page }) => {
    await record(page, 'score', 'spike');
    await expect(mine(page)).toHaveText('1');
    await expect(page.locator('.entry-wrap')).toHaveCount(1);
    await expect(page.locator('.entry-name').first()).toHaveText('アタックで得点');
    await expect(page.locator('#toast-root .toast')).toContainText('得点を記録しました');
    expect(await page.locator('#fx-root .confetti').count()).toBeGreaterThan(0);
  });

  test('全員ボーナスで2点入り、ボーナス表示が出る', async ({ page }) => {
    await record(page, 'score', 'placement', { bonus: true });
    await expect(mine(page)).toHaveText('2');
    await expect(page.locator('#fx-root .bonus-pop')).toContainText('全員ボーナス');
    await expect(page.locator('.score-rule')).toContainText('+1');
  });

  test('失点を記録すると相手の点が増える', async ({ page }) => {
    await record(page, 'fault', 'receive');
    await expect(theirs(page)).toHaveText('1');
    await expect(page.locator('.entry-score.fault').first()).toHaveText('−1');
  });

  test('お知らせの「取り消す」で記録を取り消し、「元に戻す」で戻せる', async ({ page }) => {
    await record(page, 'score', 'serve');
    await page.locator('#toast-action').click();
    await expect(mine(page)).toHaveText('0');
    await expect(page.locator('#toast-root .toast')).toContainText('記録を取り消しました');
    await page.locator('#toast-action').click();
    await expect(mine(page)).toHaveText('1');
  });

  test('×ボタンと「1つ戻す」で記録を取り消せる', async ({ page }) => {
    await record(page, 'score', 'serve');
    await record(page, 'fault', 'serve');
    await page.locator('[data-action="remove-event"]').first().click();
    await expect(theirs(page)).toHaveText('0');
    await expect(page.locator('.entry-wrap')).toHaveCount(1);
    await page.locator('[data-action="undo-last"]').click();
    await expect(mine(page)).toHaveText('0');
    await expect(page.locator('.empty')).toBeVisible();
  });

  test('左にスワイプすると記録を取り消せる', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'タッチ操作はスマホで確かめます');
    await record(page, 'score', 'serve');
    await record(page, 'score', 'spike');
    await page.evaluate(() => {
      const el = document.querySelector('.entry[data-swipe-id]');
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const t = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      const fire = (type, x) => el.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t(x)], changedTouches: [t(x)],
      }));
      fire('touchstart', r.right - 20);
      for (let i = 1; i <= 8; i++) fire('touchmove', r.right - 20 - i * 20);
      fire('touchend', r.right - 180);
    });
    await expect(page.locator('.entry-wrap')).toHaveCount(1);
    await expect(mine(page)).toHaveText('1');
  });

  test('Escキーと背景のタップで記録シートを閉じられる', async ({ page, isMobile }) => {
    test.skip(isMobile, 'キーボード操作はPCで確かめます');
    await page.locator('.action-score').click();
    await expect(page.locator('#sheet-root .sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#sheet-root .sheet')).toHaveCount(0);
    await page.locator('.action-fault').click();
    await page.locator('#modal-backdrop').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('#sheet-root .sheet')).toHaveCount(0);
    await expect(mine(page)).toHaveText('0');
  });
});

test.describe('試合の管理', () => {
  test('試合を終えると記録ボタンが止まり、再開できる', async ({ page }) => {
    await record(page, 'score', 'serve');
    await page.locator('[data-action="end-match"]').click();
    await confirmDialog(page);
    await expect(page.locator('.live')).toContainText('終了');
    await expect(page.locator('.action-score')).toBeDisabled();
    await page.locator('[data-action="resume"]').click();
    await expect(page.locator('.action-score')).toBeEnabled();
  });

  test('新しい試合を名前を付けて作れる', async ({ page }) => {
    await page.locator('[data-action="new-match"]').first().click();
    const input = page.locator('#dialog-input');
    await expect(input).toHaveValue('ゲーム 2');
    await input.fill('6年1組 第2試合');
    await confirmDialog(page);
    await expect(page.locator('.page-intro h1')).toHaveText('6年1組 第2試合');
    await openTab(page, 'matches');
    await expect(page.locator('.match-row')).toHaveCount(2);
  });

  test('試合の削除は確認画面でキャンセルでき、実行すると消える', async ({ page }) => {
    await page.locator('[data-action="load-sample"]').click();
    await page.locator('[data-action="new-match"]').first().click();
    await confirmDialog(page);
    await openTab(page, 'matches');
    await expect(page.locator('.match-row')).toHaveCount(2);
    await page.locator('[data-action="delete-match"]').first().click();
    await page.locator('#dialog-root [data-dialog="cancel"]').click();
    await expect(page.locator('.match-row')).toHaveCount(2);
    await page.locator('[data-action="delete-match"]').first().click();
    await confirmDialog(page);
    await expect(page.locator('.match-row')).toHaveCount(1);
  });
});

test.describe('分析', () => {
  test('強みと課題がそれぞれ50字以上の丁寧な文章で出る', async ({ page }) => {
    await page.locator('[data-action="load-sample"]').click();
    await openTab(page, 'chart');
    const strength = (await page.locator('.obs:not(.fault) .kid').innerText()).trim();
    const challenge = (await page.locator('.obs.fault .kid').innerText()).trim();
    for (const text of [strength, challenge]) {
      expect([...text].length).toBeGreaterThanOrEqual(50);
      expect(text).toMatch(/(です|ます|ました|ましょう)。$/);
      expect(text).not.toMatch(/だよ|だね|しよう[。！]/);
    }
    expect(strength).toContain('「アタック」');
    expect(challenge).toContain('「つなぎ」');
  });

  test('記録の少ない試合でも50字以上になる', async ({ page }) => {
    await record(page, 'score', 'opponent');
    await record(page, 'fault', 'other');
    await openTab(page, 'chart');
    expect([...(await page.locator('.obs:not(.fault) .kid').innerText()).trim()].length).toBeGreaterThanOrEqual(50);
    expect([...(await page.locator('.obs.fault .kid').innerText()).trim()].length).toBeGreaterThanOrEqual(50);
  });

  test('得点率と理由のグラフが表示される', async ({ page }) => {
    await page.locator('[data-action="load-sample"]').click();
    await openTab(page, 'chart');
    await expect(page.locator('.stat.teal .stat-value')).toHaveText(/62\s*%/);
    expect(await page.locator('.fill').count()).toBeGreaterThan(3);
    await expect(page.locator('.stat.teal')).not.toContainText('つないだ');
  });

  test('次の作戦を保存すると記録画面に表示される', async ({ page }) => {
    await record(page, 'fault', 'connect');
    await openTab(page, 'chart');
    await page.locator('#goal-text').fill('声をかけて3回つなぐ');
    await page.locator('#goal-form button[type="submit"]').click();
    await expect(page.locator('#toast-root .toast')).toContainText('次の作戦を保存しました');
    await openTab(page, 'record');
    await expect(page.locator('.insight .prompt-box')).toContainText('声をかけて3回つなぐ');
  });

  test('AIのヒントを押すと、使えない環境では記録からのヒントが出る', async ({ page }) => {
    await record(page, 'score', 'serve');
    await openTab(page, 'chart');
    await page.locator('[data-action="ai"]').click();
    await expect(page.locator('#ai-result')).toContainText('記録からのヒント');
  });
});

test.describe('設定と保存', () => {
  test('チーム名とボーナスのルールを変更できる', async ({ page }) => {
    await openTab(page, 'settings');
    await page.locator('#my-team').fill('ひまわり');
    await page.locator('#other-team').fill('さくら');
    await page.locator('#bonus-rule').uncheck();
    await page.locator('#match-form button[type="submit"]').click();
    await expect(page.locator('#toast-root .toast')).toContainText('設定を保存しました');
    await openTab(page, 'record');
    await expect(page.locator('.score-team').first()).toHaveText('ひまわり');
    await expect(page.locator('.score-team').nth(1)).toHaveText('さくら');
    await page.locator('.action-score').click();
    await expect(page.locator('#bonus-check')).toHaveCount(0);
  });

  test('ページを開き直しても記録が残る', async ({ page }) => {
    await record(page, 'score', 'spike');
    await record(page, 'fault', 'serve');
    await page.reload();
    await expect(mine(page)).toHaveText('1');
    await expect(theirs(page)).toHaveText('1');
    await expect(page.locator('.entry-wrap')).toHaveCount(2);
  });

  test('JSONで保存し、読み込みで元に戻せる', async ({ page }) => {
    await page.locator('[data-action="load-sample"]').click();
    await openTab(page, 'settings');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-action="export-json"]').click(),
    ]);
    expect(download.suggestedFilename()).toBe('volley-lens-backup.json');
    const backup = JSON.parse(require('fs').readFileSync(await download.path(), 'utf8'));
    expect(backup.version).toBe(2);
    expect(backup.matches[0].events).toHaveLength(13);

    await page.locator('[data-action="reset-all"]').click();
    await confirmDialog(page);
    await expect(page.locator('.empty')).toBeVisible();

    await openTab(page, 'settings');
    await page.locator('#backup-import').setInputFiles({
      name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
    });
    await confirmDialog(page);
    await expect(page.locator('#toast-root .toast')).toContainText('バックアップを復元しました');
    await expect(page.locator('.match-score')).toHaveText('9 : 5');
  });

  test('形式の違うファイルは読み込まない', async ({ page }) => {
    await openTab(page, 'settings');
    await page.locator('#backup-import').setInputFiles({
      name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}'),
    });
    await expect(page.locator('#toast-root .toast')).toContainText('読み込み失敗');
  });

  test('CSVで保存できる', async ({ page }) => {
    await page.locator('[data-action="load-sample"]').click();
    await openTab(page, 'settings');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-action="export-csv"]').click(),
    ]);
    expect(download.suggestedFilename()).toBe('volley-lens-records.csv');
    const csv = require('fs').readFileSync(await download.path(), 'utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toContain('"event_type"');
    expect(lines).toHaveLength(14);
  });

  test('すべての記録を消すと空の状態に戻る', async ({ page }) => {
    await page.locator('[data-action="load-sample"]').click();
    await openTab(page, 'settings');
    await page.locator('[data-action="reset-all"]').click();
    await confirmDialog(page);
    await expect(page.locator('.empty')).toBeVisible();
    await expect(mine(page)).toHaveText('0');
  });
});

test.describe('画面と動き', () => {
  test('メニューの切り替えで選択の背景が移動する', async ({ page }) => {
    const indicator = page.locator('.nav-indicator');
    for (const [id, i] of [['chart', 1], ['matches', 2], ['settings', 3], ['record', 0]]) {
      await openTab(page, id);
      await expect(indicator).toHaveAttribute('style', new RegExp(`translateX\\(${i * 100}%\\)`));
    }
  });

  test('動きを減らす設定では紙吹雪を出さない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await record(page, 'score', 'serve', { bonus: true });
    await expect(mine(page)).toHaveText('2');
    expect(await page.locator('#fx-root > *').count()).toBe(0);
  });

  for (const width of [360, 400, 1280]) {
    test(`幅${width}pxでどの画面も横にはみ出さない`, async ({ page }) => {
      await page.setViewportSize({ width, height: 860 });
      await page.locator('[data-action="load-sample"]').click();
      for (const id of ['record', 'chart', 'matches', 'settings']) {
        await openTab(page, id);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${id} の画面`).toBeLessThanOrEqual(0);
      }
    });
  }
});

test.describe('アプリとして使うための設定（PWA）', () => {
  test('マニフェストとアイコンが読み込める', async ({ page, baseURL }) => {
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const res = await page.request.get(new URL(href, baseURL).href);
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.short_name).toBe('Volley Lens');
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) {
      const img = await page.request.get(new URL(icon.src, new URL(href, baseURL)).href);
      expect(img.ok(), icon.src).toBeTruthy();
      expect(img.headers()['content-type']).toContain('image/png');
    }
  });

  test('オフライン用のservice workerが動いている', async ({ page }) => {
    const active = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return Boolean(reg.active);
    });
    expect(active).toBe(true);
  });

  test('一度開いたあとはオフラインでも表示できる', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.locator('.brand-name')).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.brand-name')).toBeVisible();
    await expect(page.locator('.action-score')).toBeVisible();
    await context.setOffline(false);
  });
});
