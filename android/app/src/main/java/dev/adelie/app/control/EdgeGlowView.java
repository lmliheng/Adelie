package dev.adelie.app.control;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;
import android.view.animation.LinearInterpolator;

import dev.adelie.app.R;

/**
 * 屏幕四周那圈光带：只在手机被操作时出现，提示「现在它在动你的屏幕」。
 * 只是个不能点的浮层视图，呼吸式明暗，不接收触摸。
 */
final class EdgeGlowView extends View {

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rect = new RectF();
    private final int accent;
    private float pulse = 0.35f;
    private ValueAnimator animator;

    EdgeGlowView(Context context) {
        super(context);
        accent = context.getResources().getColor(R.color.control_glow, context.getTheme());
        paint.setStyle(Paint.Style.STROKE);
        setBackgroundColor(0x00000000);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        animator = ValueAnimator.ofFloat(0.22f, 0.55f);
        animator.setDuration(1400);
        animator.setRepeatMode(ValueAnimator.REVERSE);
        animator.setRepeatCount(ValueAnimator.INFINITE);
        animator.setInterpolator(new LinearInterpolator());
        animator.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator animation) {
                pulse = (float) animation.getAnimatedValue();
                invalidate();
            }
        });
        animator.start();
    }

    @Override
    protected void onDetachedFromWindow() {
        if (animator != null) {
            animator.cancel();
            animator = null;
        }
        super.onDetachedFromWindow();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float density = getResources().getDisplayMetrics().density;
        float stroke = 2.4f * density;
        float inset = stroke / 2f + 1f * density;
        rect.set(inset, inset, getWidth() - inset, getHeight() - inset);
        float radius = 16f * density;

        paint.setStrokeWidth(stroke * 2.2f);
        paint.setColor(withAlpha(accent, pulse * 0.30f));
        canvas.drawRoundRect(rect, radius, radius, paint);

        paint.setStrokeWidth(stroke);
        paint.setColor(withAlpha(accent, pulse));
        canvas.drawRoundRect(rect, radius, radius, paint);
    }

    private static int withAlpha(int color, float alpha) {
        int a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
        return (color & 0x00FFFFFF) | (a << 24);
    }
}
