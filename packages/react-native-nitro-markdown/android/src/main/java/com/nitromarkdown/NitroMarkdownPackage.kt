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

        init {
            try {
                NitroMarkdownOnLoad.initializeNative()
                Log.d(TAG, "NitroMarkdown native library initialized successfully.")
            } catch (e: Throwable) {
                Log.e(TAG, "Failed to initialize NitroMarkdown native library.", e)
                throw e
            }
        }
    }
}
