package com.nitromarkdown

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.margelo.nitro.com.nitromarkdown.NitroMarkdownOnLoad

class NitroMarkdownPackage : ReactPackage {
    init {
        NitroMarkdownOnLoad.initializeNative()
    }

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = emptyList()
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
