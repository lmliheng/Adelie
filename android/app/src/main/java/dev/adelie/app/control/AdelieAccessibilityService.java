package dev.adelie.app.control;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.view.accessibility.AccessibilityEvent;

/**
 * 「手机操控」的无障碍服务。它自己不干活，只把系统回调转给 {@link PhoneControl}，
 * 真正读屏、点按、输入的实现都在那里，这样也能在 JVM 上被单测覆盖。
 */
public class AdelieAccessibilityService extends AccessibilityService {

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        PhoneControl.attach(this);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        PhoneControl.onEvent(event);
    }

    @Override
    public void onInterrupt() {
        // 系统收回服务时不会给回调，下一次 attach 时会重新取到实例
    }

    @Override
    public boolean onUnbind(Intent intent) {
        PhoneControl.detach(this);
        return super.onUnbind(intent);
    }
}
