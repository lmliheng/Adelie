package dev.adelie.app.control;

import android.app.Activity;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Bundle;

/**
 * 系统要求「屏幕录制」授权必须由一个前台 Activity 发起，所以有这么一页：
 * 透明的、马上弹系统对话框，拿到结果就关掉，用户看到的只是系统那个确认框。
 */
public class ProjectionActivity extends Activity {
    private static final int REQ = 2001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        MediaProjectionManager manager =
                (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            finish();
            return;
        }
        try {
            startActivityForResult(manager.createScreenCaptureIntent(), REQ);
        } catch (Exception e) {
            finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ) return;
        if (resultCode == RESULT_OK && data != null) {
            Projection.start(this, data);
        }
        finish();
    }
}
