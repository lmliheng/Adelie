package dev.adelie.app.control;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

import dev.adelie.app.MainActivity;
import dev.adelie.app.R;

/**
 * 小屏上的确认卡长什么样：320×480 的机型 + 一段很长的确认理由，看按钮是不是还在。
 *
 *   gradle :app:testDebugUnitTest --tests dev.adelie.app.control.ConfirmCardScreenshotTest
 *
 * 图在 app/build/ui-shots/16-confirm-small.png。这里不是为了好看，是为了让「按钮有没有被挤出屏幕」
 * 这种只能靠眼睛看的问题有个可以回看的证据。
 */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w320dp-h480dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class ConfirmCardScreenshotTest {

    @Test
    public void smallScreenWithALongReason() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        int density = Math.round(a.getResources().getDisplayMetrics().density);
        int screenW = a.getResources().getDisplayMetrics().widthPixels;
        int screenH = a.getResources().getDisplayMetrics().heightPixels;
        int margin = 12 * density;

        FrameLayout stage = new FrameLayout(a);
        stage.setBackgroundColor(a.getColor(R.color.surface));

        View card = LayoutInflater.from(a).inflate(R.layout.overlay_confirm, stage, false);
        StringBuilder reason = new StringBuilder("把这条消息发送到「家里人」群：");
        for (int i = 0; i < 14; i++) {
            reason.append("明天下午三点在小区门口见，带上那份签好的合同和身份证复印件。");
        }
        ((TextView) card.findViewById(R.id.cf_reason)).setText(reason.toString());
        ((TextView) card.findViewById(R.id.cf_timer)).setText(
                a.getString(R.string.control_confirm_timer, "1:46"));

        int width = screenW - margin * 2;
        ControlOverlay.fitCard(card, width, screenH - margin * 2 - 24 * density, 8 * density);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(width,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        lp.bottomMargin = margin;
        stage.addView(card, lp);

        stage.measure(View.MeasureSpec.makeMeasureSpec(screenW, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(screenH, View.MeasureSpec.EXACTLY));
        stage.layout(0, 0, screenW, screenH);
        Bitmap bmp = Bitmap.createBitmap(screenW, screenH, Bitmap.Config.ARGB_8888);
        stage.draw(new Canvas(bmp));

        File dir = new File("build/ui-shots");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("no dir");
        try (OutputStream out = new FileOutputStream(new File(dir, "16-confirm-small.png"))) {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
        }
    }
}
