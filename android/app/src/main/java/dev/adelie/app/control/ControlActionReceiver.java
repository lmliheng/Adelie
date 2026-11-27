package dev.adelie.app.control;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 通知栏上「暂停 / 继续 / 免确认 / 停止」几个按钮的落点。
 *
 * <p>按钮只能是 PendingIntent，最省事的就是发给自己的接收器；不用起 Activity，
 * 人可能在别的应用里，点一下立刻生效。
 */
public class ControlActionReceiver extends BroadcastReceiver {

    public static final String ACTION_TASK = "dev.adelie.app.control.TASK";
    public static final String EXTRA_OP = "op";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String op = intent.getStringExtra(EXTRA_OP);
        if ("pause".equals(op)) {
            PhoneControl.togglePause();
        } else if ("allow".equals(op)) {
            PhoneControl.toggleAllowAll();
        } else if ("stop".equals(op)) {
            PhoneControl.stopByUser();
        }
    }
}
