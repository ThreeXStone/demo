import { Injectable } from '@nestjs/common';

/**
 * UI 操作上下文
 */
export interface UIContext {
  uiStage?: string;
  userAction?: { action: string; data: Record<string, unknown> };
  collectedData: Record<string, unknown>;
}

@Injectable()
export class UIActionParser {
  /**
   * 检测并解析 UI 操作，构建 UIContext。
   * @param body 请求 body（可能是字符串或 UI 操作对象）
   * @param lastMessageMetadata 上一条消息的 metadata
   * @returns UIContext 或 null（不是 UI 操作）
   */
  parse(body: unknown, lastMessageMetadata?: Record<string, unknown>): UIContext | null {
    if (!body || typeof body !== 'object') return null;

    const obj = body as Record<string, unknown>;

    // 检测 UI 操作：有 componentType 和 payload 字段
    if (!obj.componentType && !obj.payload) return null;

    const userAction = {
      action: (obj.action as string) || 'submit',
      data: (obj.payload as Record<string, unknown>) || {},
    };

    const uiStage = lastMessageMetadata?.uiStage as string | undefined;
    const previousCollectedData =
      (lastMessageMetadata?.collectedData as Record<string, unknown>) || {};

    return {
      uiStage,
      userAction,
      collectedData: { ...previousCollectedData, ...userAction.data },
    };
  }
}
