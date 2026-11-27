package dev.adelie.app.control;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.Charset;
import java.util.List;

/**
 * 技能包要跟着 App 走：装好的每个 Agent 都能拿到「怎么调手机操控」。
 * 这里验的是「写对地方、内容对、重复跑不重写、改了会补上」。
 *
 * <p>目录布局必须是 Adelie 服务端真正用的那一种：
 * {@code <ADELIE_HOME>/<项目>/agents/<id>/agent_state/skills/phone-control}。
 * 早先漏了项目这一层，技能落到 {@code <ADELIE_HOME>/agents}，服务端永远扫不到。
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class PhoneSkillTest {
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private Context context;
    private File data;
    private File agentState;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        data = new File(context.getFilesDir(), "adelie/data");
        agentState = new File(data, "default_project/agents/default_agent/agent_state");
        assertTrue(agentState.mkdirs() || agentState.isDirectory());
    }

    @Test
    public void writesSkillAndHelperForEveryAgent() throws Exception {
        assertEquals(1, PhoneSkill.ensure(context));

        File skill = new File(agentState, "skills/phone-control/SKILL.md");
        assertTrue(skill.isFile());
        String text = read(skill);
        assertTrue(text.startsWith("---"));
        assertTrue(text.contains("name: phone-control"));
        assertTrue(text.contains("tools/phone.js"));
        assertTrue(text.contains("error=cancelled"));
        // 自检入口要先写清：模型第一句就该跑它
        assertTrue(text.contains("phone.js\" doctor"));
        // 把「别用 shell 去试」的错路堵死
        assertTrue(text.contains("uiautomator"));

        File helper = new File(data, "tools/phone.js");
        assertTrue(helper.isFile());
        assertTrue(read(helper).contains("phone-control.json"));

        assertEquals(1, PhoneSkill.installed(context));
        assertEquals(1, PhoneSkill.installedAgentDirs(context).size());
        assertEquals("default_agent", PhoneSkill.installedAgentDirs(context).get(0));
    }

    @Test
    public void everyProjectGetsIt() throws Exception {
        // 用户可能建了别的项目；项目 id 不是写死的，得都扫到
        File other = new File(data, "work/agents/helper_bot/agent_state");
        assertTrue(other.mkdirs() || other.isDirectory());

        assertEquals(2, PhoneSkill.ensure(context));
        assertTrue(new File(agentState, "skills/phone-control/SKILL.md").isFile());
        assertTrue(new File(other, "skills/phone-control/SKILL.md").isFile());
        assertEquals(2, PhoneSkill.installed(context));
    }

    @Test
    public void legacyLayoutStillWorks() throws Exception {
        // 1.3.3 之前写在 <ADELIE_HOME>/agents 下的那份，升级上来也要继续维护
        File legacy = new File(data, "agents/default_agent/agent_state");
        assertTrue(legacy.mkdirs() || legacy.isDirectory());

        assertEquals(2, PhoneSkill.ensure(context));
        assertTrue(new File(legacy, "skills/phone-control/SKILL.md").isFile());
    }

    @Test
    public void toolsAndTmpAreNotMistakenForProjects() throws Exception {
        File tools = new File(data, "tools");
        assertTrue(tools.mkdirs() || tools.isDirectory());
        File tmp = new File(data, "tmp");
        assertTrue(tmp.mkdirs() || tmp.isDirectory());

        assertEquals(1, PhoneSkill.ensure(context));
        List<File> states = PhoneSkill.agentStates(data);
        assertEquals(1, states.size());
        assertEquals(agentState, states.get(0));
    }

    @Test
    public void secondRunIsANoOp() {
        PhoneSkill.ensure(context);
        long first = new File(agentState, "skills/phone-control/SKILL.md").lastModified();
        assertEquals(0, PhoneSkill.ensure(context));
        assertEquals(first, new File(agentState, "skills/phone-control/SKILL.md").lastModified());
    }

    @Test
    public void rewrittenWhenTheAgentEditedIt() throws Exception {
        PhoneSkill.ensure(context);
        File skill = new File(agentState, "skills/phone-control/SKILL.md");
        FileOutputStream out = new FileOutputStream(skill);
        out.write("被改过了".getBytes(UTF8));
        out.close();
        assertEquals(1, PhoneSkill.ensure(context));
        assertTrue(read(skill).contains("name: phone-control"));
    }

    @Test
    public void nothingToDoBeforeThePayloadIsUnpacked() {
        Context bare = ApplicationProvider.getApplicationContext();
        // 换一个没有 adelie/data 的 Context（新装的机器第一次启动就是这样）
        Context other = new android.content.ContextWrapper(bare) {
            @Override
            public File getFilesDir() {
                return new File(bare.getCacheDir(), "not-yet");
            }
        };
        assertEquals(-1, PhoneSkill.ensure(other));
        assertEquals(0, PhoneSkill.installed(other));
        assertTrue(PhoneSkill.installedAgentDirs(other).isEmpty());
    }

    private static String read(File f) throws Exception {
        java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
        java.io.FileInputStream in = new java.io.FileInputStream(f);
        byte[] chunk = new byte[4096];
        int n;
        while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
        in.close();
        return buf.toString("UTF-8");
    }
}
