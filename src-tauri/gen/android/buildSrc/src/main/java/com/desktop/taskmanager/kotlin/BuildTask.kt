import java.io.File
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

/**
 * 替代 tauri CLI 的 `android android-studio-script` 任务。
 *
 * 原实现通过 `npm run tauri android android-studio-script` 编译 Rust 库并在
 * jniLibs 下创建符号链接。Windows 上未开启开发者模式时 symlink 会失败。
 * 这里改为直接运行 cargo 构建（复用项目内迁移到 ASCII 路径的 RUSTUP_HOME），
 * 然后将产物 .so 复制到 jniLibs/<abi>，规避 symlink 权限问题。
 */
open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    private val archTriple = mapOf(
        "aarch64" to "aarch64-linux-android",
        "armv7" to "armv7-linux-androideabi",
        "i686" to "i686-linux-android",
        "x86_64" to "x86_64-linux-android",
    )

    private val abiDir = mapOf(
        "aarch64" to "arm64-v8a",
        "armv7" to "armeabi-v7a",
        "i686" to "x86",
        "x86_64" to "x86_64",
    )

    @TaskAction
    fun assemble() {
        val targetName = target ?: throw GradleException("target cannot be null")
        val isRelease = release ?: throw GradleException("release cannot be null")
        val tauriDir = File(project.projectDir, rootDirRel ?: throw GradleException("rootDirRel cannot be null"))
        val triple = archTriple[targetName] ?: throw GradleException("unknown target: $targetName")
        val abi = abiDir[targetName] ?: throw GradleException("unknown abi for target: $targetName")
        val profile = if (isRelease) "release" else "debug"

        project.exec {
            workingDir(tauriDir)
            commandLine(
                "cargo", "build",
                "--package", "app",
                "--manifest-path", File(tauriDir, "Cargo.toml").absolutePath,
                "--target", triple,
                "--features", "tauri/custom-protocol",
                "--lib",
            )
            if (isRelease) {
                args("--release")
            }

            // 注入 NDK clang 工具链（tauri CLI 会自行配置，直接调 cargo 必须手动设置）
            val ndkHome = System.getenv("NDK_HOME") ?: throw GradleException("NDK_HOME is not set")
            val ndkBin = File(ndkHome, "toolchains/llvm/prebuilt/windows-x86_64/bin")
            val clangPrefix = when (targetName) {
                "aarch64" -> "aarch64-linux-android24-clang.cmd"
                "armv7" -> "armv7-linux-androideabi24-clang.cmd"
                "i686" -> "i686-linux-android24-clang.cmd"
                "x86_64" -> "x86_64-linux-android24-clang.cmd"
                else -> throw GradleException("unsupported target: $targetName")
            }
            val clang = File(ndkBin, clangPrefix).absolutePath
            val ar = File(ndkBin, "llvm-ar.exe").absolutePath
            val linkerEnv = "CARGO_TARGET_" + triple.replace('-', '_').uppercase() + "_LINKER"
            environment("CC_$triple", clang)
            environment("AR_$triple", ar)
            environment(linkerEnv, clang)
            environment("PATH", ndkBin.absolutePath + File.pathSeparator + System.getenv("PATH"))
        }.assertNormalExitValue()

        val libFile = File(tauriDir, "target/$triple/$profile/libapp_lib.so")
        if (!libFile.exists()) {
            throw GradleException("Rust library not found: ${libFile.absolutePath}")
        }
        val destDir = File(project.projectDir, "src/main/jniLibs/$abi")
        destDir.mkdirs()
        libFile.copyTo(File(destDir, "libapp_lib.so"), overwrite = true)
    }
}
