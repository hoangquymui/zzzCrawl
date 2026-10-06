import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';

@Injectable()
export class ProfileTimelineScroller {
  private readonly logger = new Logger(ProfileTimelineScroller.name);

  public async scrollStep(page: Page, timeoutMs = 2500): Promise<{ previousHeight: number; newHeight: number; grew: boolean }> {
    try {
      const prevHeight = await page.evaluate(() => document.body.scrollHeight);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page
        .waitForFunction((h: number) => document.body.scrollHeight > h, prevHeight, {
          timeout: timeoutMs,
        })
        .catch(() => {});

      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      return {
        previousHeight: prevHeight,
        newHeight,
        grew: newHeight > prevHeight,
      };
    } catch (err: any) {
      this.logger.debug(`Lỗi cuộn trang: ${err?.message || String(err)}`);
      return { previousHeight: 0, newHeight: 0, grew: false };
    }
  }

  public async scrollToTop(page: Page): Promise<void> {
    try {
      await page.evaluate(() => window.scrollTo(0, 0));
    } catch {
      // Bỏ qua lỗi context
    }
  }
}
