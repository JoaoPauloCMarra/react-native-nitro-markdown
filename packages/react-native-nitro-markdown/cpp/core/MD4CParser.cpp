#include "MD4CParser.hpp"
#include "../md4c/md4c.h"

#include <stack>
#include <cstring>
#include <limits>

namespace NitroMarkdown {

namespace {
size_t clampInputSize(size_t inputSize) {
    size_t maxSize = static_cast<size_t>(std::numeric_limits<MD_SIZE>::max());
    if (inputSize > maxSize) {
        return maxSize;
    }
    return inputSize;
}
} // namespace

class MD4CParser::Impl {
public:
    std::shared_ptr<MarkdownNode> root;
    std::stack<std::shared_ptr<MarkdownNode>> nodeStack;
    std::string currentText;
    const char* inputText = nullptr;
    size_t inputTextSize = 0;
    OFF currentTextBeg = 0;
    OFF lastTextEnd = 0;
    
    void reset() {
        root = std::make_shared<MarkdownNode>(NodeType::Document);
        while (!nodeStack.empty()) nodeStack.pop();
        nodeStack.push(root);
        currentText.clear();
        currentText.reserve(256);
        currentTextBeg = 0;
        lastTextEnd = 0;
    }
    
    void flushText() {
        if (!currentText.empty() && !nodeStack.empty()) {
            auto textNode = std::make_shared<MarkdownNode>(NodeType::Text);
            textNode->content = std::move(currentText);
            textNode->beg = currentTextBeg;
            textNode->end = lastTextEnd;
            nodeStack.top()->addChild(std::move(textNode));
            currentText.clear();
        }
    }
    
    void pushNode(std::shared_ptr<MarkdownNode> node, OFF beg = 0) {
        flushText();
        if (node && !nodeStack.empty()) {
            node->beg = beg;
            nodeStack.top()->addChild(node);
            nodeStack.push(std::move(node));
        }
    }
    
    void popNode(OFF end = 0) {
        flushText();
        if (nodeStack.size() > 1) {
            nodeStack.top()->end = end;
            nodeStack.pop();
        }
    }
    
    std::string getAttributeText(const MD_ATTRIBUTE* attr) {
        if (!attr || attr->size == 0 || !attr->text) return "";
        if (!attr->substr_types || !attr->substr_offsets) {
            return std::string(attr->text, attr->size);
        }

        std::string result;
        result.reserve(attr->size);

        for (unsigned i = 0; ; i++) {
            size_t start = static_cast<size_t>(attr->substr_offsets[i]);
            size_t end = static_cast<size_t>(attr->substr_offsets[i + 1]);

            if (end > attr->size) {
                end = static_cast<size_t>(attr->size);
            }
            if (start > end) {
                break;
            }

            if (attr->substr_types[i] == MD_TEXT_NORMAL ||
                attr->substr_types[i] == MD_TEXT_ENTITY ||
                attr->substr_types[i] == MD_TEXT_NULLCHAR) {
                if (end > start) {
                    result.append(attr->text + start, end - start);
                }
            }

            if (end >= attr->size) {
                break;
            }
        }

        if (result.empty() && attr->size > 0) {
            result.assign(attr->text, attr->size);
        }

        return result;
    }
    
    static int enterBlock(MD_BLOCKTYPE type, void* detail, MD_OFFSET off, void* userdata) {
        auto* impl = static_cast<Impl*>(userdata);
        
        switch (type) {
            case MD_BLOCK_DOC:
                break;
                
            case MD_BLOCK_QUOTE: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::Blockquote), off);
                break;
            }
                
            case MD_BLOCK_UL: {
                auto node = std::make_shared<MarkdownNode>(NodeType::List);
                node->ordered = false;
                impl->pushNode(node, off);
                break;
            }
                
            case MD_BLOCK_OL: {
                auto* d = static_cast<MD_BLOCK_OL_DETAIL*>(detail);
                auto node = std::make_shared<MarkdownNode>(NodeType::List);
                node->ordered = true;
                node->start = d->start;
                impl->pushNode(node, off);
                break;
            }
                
            case MD_BLOCK_LI: {
                auto* d = static_cast<MD_BLOCK_LI_DETAIL*>(detail);
                if (d->is_task) {
                    auto node = std::make_shared<MarkdownNode>(NodeType::TaskListItem);
                    node->checked = (d->task_mark == 'x' || d->task_mark == 'X');
                    impl->pushNode(node, off);
                } else {
                    impl->pushNode(std::make_shared<MarkdownNode>(NodeType::ListItem), off);
                }
                break;
            }
                
            case MD_BLOCK_HR: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::HorizontalRule), off);
                break;
            }
                
            case MD_BLOCK_H: {
                auto* d = static_cast<MD_BLOCK_H_DETAIL*>(detail);
                auto node = std::make_shared<MarkdownNode>(NodeType::Heading);
                node->level = d->level;
                impl->pushNode(node, off);
                break;
            }
                
            case MD_BLOCK_CODE: {
                auto* d = static_cast<MD_BLOCK_CODE_DETAIL*>(detail);
                auto node = std::make_shared<MarkdownNode>(NodeType::CodeBlock);
                if (d->lang.size > 0) {
                    node->language = impl->getAttributeText(&d->lang);
                }
                impl->pushNode(node, off);
                break;
            }
                
            case MD_BLOCK_HTML: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::HtmlBlock), off);
                break;
            }
                
            case MD_BLOCK_P: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::Paragraph), off);
                break;
            }
                
            case MD_BLOCK_TABLE: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::Table), off);
                break;
            }
                
            case MD_BLOCK_THEAD: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::TableHead), off);
                break;
            }
                
            case MD_BLOCK_TBODY: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::TableBody), off);
                break;
            }
                
            case MD_BLOCK_TR: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::TableRow), off);
                break;
            }
                
            case MD_BLOCK_TH: {
                auto* d = static_cast<MD_BLOCK_TD_DETAIL*>(detail);
                auto node = std::make_shared<MarkdownNode>(NodeType::TableCell);
                node->isHeader = true;
                switch (d->align) {
                    case MD_ALIGN_LEFT: node->align = TextAlign::Left; break;
                    case MD_ALIGN_CENTER: node->align = TextAlign::Center; break;
                    case MD_ALIGN_RIGHT: node->align = TextAlign::Right; break;
                    default: node->align = TextAlign::Default; break;
                }
                impl->pushNode(node, off);
                break;
            }
                
            case MD_BLOCK_TD: {
                auto* d = static_cast<MD_BLOCK_TD_DETAIL*>(detail);
                auto node = std::make_shared<MarkdownNode>(NodeType::TableCell);
                node->isHeader = false;
                switch (d->align) {
                    case MD_ALIGN_LEFT: node->align = TextAlign::Left; break;
                    case MD_ALIGN_CENTER: node->align = TextAlign::Center; break;
                    case MD_ALIGN_RIGHT: node->align = TextAlign::Right; break;
                    default: node->align = TextAlign::Default; break;
                }
                impl->pushNode(node, off);
                break;
            }
        }
        
        return 0;
    }
    
    static int leaveBlock(MD_BLOCKTYPE type, void* detail, MD_OFFSET off, void* userdata) {
        (void)detail;
        auto* impl = static_cast<Impl*>(userdata);
        
        switch (type) {
            case MD_BLOCK_DOC:
                impl->root->end = off;
                break;
            case MD_BLOCK_HR:
                impl->popNode(off);
                break;
            default:
                impl->popNode(off);
                break;
        }
        
        return 0;
    }
    
    static int enterSpan(MD_SPANTYPE type, void* detail, MD_OFFSET off, void* userdata) {
        auto* impl = static_cast<Impl*>(userdata);
        
        switch (type) {
            case MD_SPAN_EM: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::Italic), off);
                break;
            }
                
            case MD_SPAN_STRONG: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::Bold), off);
                break;
            }
                
            case MD_SPAN_DEL: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::Strikethrough), off);
                break;
            }
                
            case MD_SPAN_A: {
                auto* d = static_cast<MD_SPAN_A_DETAIL*>(detail);
                auto node = std::make_shared<MarkdownNode>(NodeType::Link);
                if (d->href.size > 0) {
                    node->href = impl->getAttributeText(&d->href);
                }
                if (d->title.size > 0) {
                    node->title = impl->getAttributeText(&d->title);
                }
                impl->pushNode(node, off);
                break;
            }
                
            case MD_SPAN_IMG: {
                auto* d = static_cast<MD_SPAN_IMG_DETAIL*>(detail);
                auto node = std::make_shared<MarkdownNode>(NodeType::Image);
                if (d->src.size > 0) {
                    node->href = impl->getAttributeText(&d->src);
                }
                if (d->title.size > 0) {
                    node->title = impl->getAttributeText(&d->title);
                }
                impl->pushNode(node, off);
                break;
            }
                
            case MD_SPAN_CODE: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::CodeInline), off);
                break;
            }
                
            case MD_SPAN_LATEXMATH: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::MathInline), off);
                break;
            }
                
            case MD_SPAN_LATEXMATH_DISPLAY: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::MathBlock), off);
                break;
            }
                
            case MD_SPAN_U: {
                impl->pushNode(std::make_shared<MarkdownNode>(NodeType::Italic), off);
                break;
            }
                
            case MD_SPAN_WIKILINK: {
                auto node = std::make_shared<MarkdownNode>(NodeType::Link);
                impl->pushNode(node, off);
                break;
            }
        }
        
        return 0;
    }
    
    static int leaveSpan(MD_SPANTYPE type, void* detail, MD_OFFSET off, void* userdata) {
        (void)detail;
        auto* impl = static_cast<Impl*>(userdata);

        if (!impl->nodeStack.empty()) {
            auto currentNode = impl->nodeStack.top();

            switch (type) {
                case MD_SPAN_CODE:
                    currentNode->content = impl->currentText;
                    impl->currentText.clear();
                    break;

                case MD_SPAN_IMG:
                    currentNode->alt = impl->currentText;
                    impl->currentText.clear();
                    break;

                default:
                    break;
            }
        }

        impl->popNode(off);
        return 0;
    }
    
    static int text(MD_TEXTTYPE type, const MD_CHAR* text, MD_SIZE size, void* userdata) {
        auto* impl = static_cast<Impl*>(userdata);

        if (!text || size == 0) return 0;

        switch (type) {
            case MD_TEXT_NULLCHAR: {
                MD_OFFSET off = impl->lastTextEnd;
                ptrdiff_t diff = text - impl->inputText;
                if (diff >= 0 && static_cast<size_t>(diff) <= impl->inputTextSize) {
                    off = static_cast<MD_OFFSET>(diff);
                }
                if (impl->currentText.empty()) impl->currentTextBeg = off;
                impl->currentText += '\0';
                impl->lastTextEnd = off + 1;
                break;
            }
                
            case MD_TEXT_BR:
                impl->flushText();
                impl->nodeStack.top()->addChild(
                    std::make_shared<MarkdownNode>(NodeType::LineBreak));
                break;
                
            case MD_TEXT_SOFTBR:
                impl->flushText();
                impl->nodeStack.top()->addChild(
                    std::make_shared<MarkdownNode>(NodeType::SoftBreak));
                break;
                
            case MD_TEXT_HTML:
                impl->flushText();
                {
                    auto node = std::make_shared<MarkdownNode>(NodeType::HtmlInline);
                    node->content = std::string(text, size);
                    impl->nodeStack.top()->addChild(node);
                }
                break;
                
            case MD_TEXT_ENTITY:
                if (text && size > 0) {
                    MD_OFFSET off = impl->lastTextEnd;
                    ptrdiff_t diff = text - impl->inputText;
                    if (diff >= 0 && static_cast<size_t>(diff) <= impl->inputTextSize) {
                        off = static_cast<MD_OFFSET>(diff);
                    }
                    if (impl->currentText.empty()) impl->currentTextBeg = off;
                    impl->currentText.append(text, size);
                    impl->lastTextEnd = off + size;
                }
                break;
                
            case MD_TEXT_NORMAL:
            case MD_TEXT_CODE:
            case MD_TEXT_LATEXMATH:
            default: {
                if (text && size > 0) {
                    MD_OFFSET off = impl->lastTextEnd;
                    ptrdiff_t diff = text - impl->inputText;
                    if (diff >= 0 && static_cast<size_t>(diff) <= impl->inputTextSize) {
                        off = static_cast<MD_OFFSET>(diff);
                    }
                    
                    if (impl->currentText.empty()) {
                        impl->currentTextBeg = off;
                    }
                    impl->currentText.append(text, size);
                    impl->lastTextEnd = off + size;
                }
                break;
            }
        }
        
        return 0;
    }
};

MD4CParser::MD4CParser() : impl_(std::make_unique<Impl>()) {}

MD4CParser::~MD4CParser() = default;

std::shared_ptr<MarkdownNode> MD4CParser::parse(const std::string& markdown, const ParserOptions& options) {
    impl_->reset();
    impl_->inputText = markdown.c_str();
    size_t inputSize = clampInputSize(markdown.size());
    impl_->inputTextSize = inputSize;
    
    unsigned int flags = MD_FLAG_NOHTML;
    
    if (options.gfm) {
        flags |= MD_FLAG_TABLES;
        flags |= MD_FLAG_STRIKETHROUGH;
        flags |= MD_FLAG_TASKLISTS;
        flags |= MD_FLAG_PERMISSIVEAUTOLINKS;
    }
    
    if (options.math) {
        flags |= MD_FLAG_LATEXMATHSPANS;
    }
    
    MD_PARSER parser = {
        0,
        flags,
        &Impl::enterBlock,
        &Impl::leaveBlock,
        &Impl::enterSpan,
        &Impl::leaveSpan,
        &Impl::text,
        nullptr,
        nullptr
    };

    md_parse(markdown.c_str(),
             static_cast<MD_SIZE>(inputSize),
             &parser, 
             impl_.get());

    impl_->flushText();
    return impl_->root;
}

} // namespace NitroMarkdown
