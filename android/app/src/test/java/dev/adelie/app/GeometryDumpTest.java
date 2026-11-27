package dev.adelie.app;

import android.view.View;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLooper;

/** 打印各层视图的实测尺寸，用来排查「底部被裁掉 / 页面比可视区更高」这类问题。 */
@RunWith(org.robolectric.RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w393dp-h852dp-xxhdpi")
public class GeometryDumpTest {

    private static void dump(String name, View v) {
        int[] loc = new int[2];
        v.getLocationInWindow(loc);
        System.out.println(String.format("GEOM %-14s w=%d h=%d top=%d bottom=%d vis=%d",
                name, v.getWidth(), v.getHeight(), loc[1], loc[1] + v.getHeight(), v.getVisibility()));
    }

    @Test
    public void dumpGeometry() {
        Core.phase = "服务已就绪";
        Core.baseUrl = "http://localhost:48231";
        Core.ready = true;
        ActivityController<MainActivity> c = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity a = c.get();
        ShadowLooper.idleMainLooper();

        View decor = a.getWindow().getDecorView();
        int w = 393 * 3;
        int h = 852 * 3;
        decor.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
        decor.layout(0, 0, w, h);

        dump("decor", decor);
        dump("root", a.findViewById(R.id.root));
        dump("app_column", a.findViewById(R.id.app_column));
        dump("banner", a.findViewById(R.id.banner));
        dump("content", a.findViewById(R.id.content));
        dump("web", a.findViewById(R.id.web));
        dump("nav", a.findViewById(R.id.nav));
        dump("splash", a.findViewById(R.id.splash));

        com.google.android.material.bottomnavigation.BottomNavigationView nav = a.findViewById(R.id.nav);
        nav.setSelectedItemId(R.id.nav_settings);
        ShadowLooper.idleMainLooper();
        decor.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
        decor.layout(0, 0, w, h);

        View page = a.findViewById(R.id.settings_page);
        dump("settings_page", page);
        View body = a.findViewById(R.id.settings_body);
        dump("settings_body", body);
        System.out.println("GEOM settings_page canScrollDown=" + page.canScrollVertically(1)
                + " childH=" + ((View) ((android.view.ViewGroup) page).getChildAt(0)).getHeight());
    }
}
