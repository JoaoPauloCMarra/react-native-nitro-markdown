import Foundation
import NitroModules

class HybridMarkdownSession: HybridMarkdownSessionSpec {
    private var buffer = ""
    private var listeners: [UUID: (Double, Double) -> Void] = [:]
    private let lock = NSLock()
    
    private(set) var version: Int = 0
    
    var highlightPosition: Double = 0
    

    
    var memorySize: Int {
        return buffer.utf8.count + MemoryLayout<HybridMarkdownSession>.size
    }

    private func utf16Length(_ value: String) -> Int {
        return (value as NSString).length
    }
    
    func append(chunk: String) throws -> Double {
        let from: Int
        let to: Int
        lock.lock()
        from = utf16Length(buffer)
        buffer += chunk
        to = utf16Length(buffer)
        version += 1
        lock.unlock()
        notifyListeners(from: Double(from), to: Double(to))
        return Double(to)
    }
    
    func clear() throws {
        lock.lock()
        buffer = ""
        highlightPosition = 0
        version += 1
        lock.unlock()
        notifyListeners(from: 0, to: 0)
    }
    
    func getAllText() throws -> String {
        lock.lock()
        defer { lock.unlock() }
        return buffer
    }

    func getLength() throws -> Double {
        lock.lock()
        defer { lock.unlock() }
        return Double(utf16Length(buffer))
    }

    func getTextRange(from: Double, to: Double) throws -> String {
        lock.lock()
        defer { lock.unlock() }

        let text = buffer as NSString
        let length = text.length
        let start = max(0, min(Int(from), length))
        let end = max(start, min(Int(to), length))
        return text.substring(with: NSRange(location: start, length: end - start))
    }
    
    func addListener(listener: @escaping (Double, Double) -> Void) throws -> () -> Void {
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
    
    func reset(text: String) -> Void {
      lock.lock()
      buffer = text
      lock.unlock()
      notifyListeners(from: 0, to: Double((text as NSString).length))
    }

    func replace(from: Double, to: Double, text: String) -> Double {
      lock.lock()
      let startIdx = buffer.index(buffer.startIndex, offsetBy: Int(from), limitedBy: buffer.endIndex) ?? buffer.endIndex
      let endIdx = buffer.index(buffer.startIndex, offsetBy: Int(to), limitedBy: buffer.endIndex) ?? buffer.endIndex
      buffer.replaceSubrange(startIdx..<endIdx, with: text)
      let newLength = Double((buffer as NSString).length)
      lock.unlock()
      notifyListeners(from: from, to: from + Double((text as NSString).length))
      return newLength
    }

    private func notifyListeners(from: Double, to: Double) {
        lock.lock()
        let currentListeners = Array(listeners.values)
        lock.unlock()
        
        for listener in currentListeners {
            listener(from, to)
        }
    }
}
