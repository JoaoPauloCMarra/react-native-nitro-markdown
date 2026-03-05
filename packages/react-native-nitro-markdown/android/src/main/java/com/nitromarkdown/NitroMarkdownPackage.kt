package com.nitromarkdown

import android.util.Log
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.margelo.nitro.com.nitromarkdown.NitroMarkdownOnLoad

class NitroMarkdownPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = emptyList()
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()

    companion object {
        private const val TAG = "NitroMarkdownPackage"

        // C4: Use lazy initialization so a native library load failure does not propagate an
        // uncaught exception during ClassLoader initialization, which would crash the app before
        // any error-handling code can run. The library simply won't be available if loading fails.
        private val initialized: Boolean by lazy {
            try {
                Log.d(TAG, "Initializing NitroMarkdown native module")
                NitroMarkdownOnLoad.initializeNative()
                Log.d(TAG, "NitroMarkdown native module initialized successfully")
                true
            } catch (e: Throwable) {
                Log.e(TAG, "Failed to initialize NitroMarkdown native module", e)
                false
            }
        }

        @JvmStatic
        fun initialize() {
            initialized // trigger lazy init
        }
    }
}
