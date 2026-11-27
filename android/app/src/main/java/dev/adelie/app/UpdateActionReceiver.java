package dev.adelie.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 「重新下载」那个按钮的落点：把人带回 Adelie，并让他知道这一趟是来继续更新。
 *
 * <p>按钮只能是 PendingIntent，而重试需要读发布站的清单（要网络、要版本号），
 * 这些都在界面里做更稳：带一个 extra 打开 MainActivity，界面起来后自己接着走。
 */
public class UpdateActionReceiver extends BroadcastReceiver {

    public static final String ACTION = "dev.adelie.app.UPDATE_ACTION";
    public static final String EXTRA_OP = "op";
    public static final String OP_RETRY = "retry";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        if (!ACTION.equals(intent.getAction())) return;
        if (!OP_RETRY.equals(intent.getStringExtra(EXTRA_OP))) return;
        UpdateNotifier.cancel(context);
        Intent open = new Intent(context, MainActivity.class)
                .putExtra(MainActivity.EXTRA_RETRY_UPDATE, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            context.startActivity(open);
        } catch (Exception ignored) {
            // 极少数 ROM 不让后台起动界面：那就算了，用户自己点开也一样
        }
    }
}
