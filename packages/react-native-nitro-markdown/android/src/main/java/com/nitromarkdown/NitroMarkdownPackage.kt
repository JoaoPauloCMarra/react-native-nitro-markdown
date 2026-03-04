package com.nitromarkdown

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import com.margelo.nitro.com.nitromarkdown.NitroMarkdownOnLoad

class NitroMarkdownPackage : BaseReactPackage() {
    companion object {
        init {
            NitroMarkdownOnLoad.initializeNative()
        }
    }

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return null
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider { emptyMap() }
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
