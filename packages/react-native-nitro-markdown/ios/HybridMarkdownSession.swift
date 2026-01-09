import Foundation
import NitroModules

class HybridMarkdownSession: HybridMarkdownSessionSpec {
    private var buffer = ""
    private var listeners: [UUID: () -> Void] = [:]
    private let lock = NSLock()
    
    private(set) var version: Int = 0
    
    var highlightPosition: Double = 0
    

    
    var memorySize: Int {
        return buffer.utf8.count + MemoryLayout<HybridMarkdownSession>.size
    }
    
    func append(chunk: String) throws {
        lock.lock()
        buffer += chunk
        version += 1
        lock.unlock()
        notifyListeners()
    }
    
    func clear() throws {
        lock.lock()
        buffer = ""
        highlightPosition = 0
        version += 1
        lock.unlock()
        notifyListeners()
    }
    
    func getAllText() throws -> String {
        lock.lock()
        defer { lock.unlock() }
        return buffer
    }
    
    func addListener(listener: @escaping () -> Void) throws -> () -> Void {
        let id = UUID()
        lock.lock()
        listeners[id] = listener
        lock.unlock()
        
        return { [weak self] in
            self?.lock.lock()
            self?.listeners.removeValue(forKey: id)
            self?.lock.unlock()
        }
    }
    
    private func notifyListeners() {
        lock.lock()
        let currentListeners = Array(listeners.values)
        lock.unlock()
        
        for listener in currentListeners {
            listener()
        }
    }
}
