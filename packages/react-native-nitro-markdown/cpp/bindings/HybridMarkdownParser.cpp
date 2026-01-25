#include "HybridMarkdownParser.hpp"
#include <sstream>
#include <iomanip>

namespace margelo::nitro::Markdown {

std::string HybridMarkdownParser::parse(const std::string& text) {
    InternalParserOptions opts;
    opts.gfm = true;
    opts.math = true;
    
    auto ast = parser_->parse(text, opts);
    return nodeToJson(ast);
}

std::string HybridMarkdownParser::parseWithOptions(const std::string& text, const ParserOptions& options) {
    InternalParserOptions internalOpts;
    internalOpts.gfm = options.gfm.value_or(true);
    internalOpts.math = options.math.value_or(true);
    
    auto ast = parser_->parse(text, internalOpts);
    return nodeToJson(ast);
}

static std::string escapeJson(const std::string& s) {
    std::ostringstream o;
    for (char c : s) {
        switch (c) {
            case '"': o << "\\\""; break;
            case '\\': o << "\\\\"; break;
            case '\b': o << "\\b"; break;
            case '\f': o << "\\f"; break;
            case '\n': o << "\\n"; break;
            case '\r': o << "\\r"; break;
            case '\t': o << "\\t"; break;
            default:
                if ('\x00' <= c && c <= '\x1f') {
                    o << "\\u" << std::hex << std::setw(4) << std::setfill('0') << (int)(unsigned char)c;
                } else {
                    o << c;
                }
        }
    }
    return o.str();
}

std::string HybridMarkdownParser::nodeToJson(const std::shared_ptr<InternalMarkdownNode>& node) {
    std::ostringstream json;
    json << "{";
    json << "\"type\":\"" << ::NitroMarkdown::nodeTypeToString(node->type) << "\"";
    json << ",\"beg\":" << node->beg;
    json << ",\"end\":" << node->end;

    if (node->content.has_value()) {
        json << ",\"content\":\"" << escapeJson(node->content.value()) << "\"";
    }
    
    if (node->level.has_value()) {
        json << ",\"level\":" << node->level.value();
    }
    
    if (node->href.has_value()) {
        json << ",\"href\":\"" << escapeJson(node->href.value()) << "\"";
    }
    
    if (node->title.has_value()) {
        json << ",\"title\":\"" << escapeJson(node->title.value()) << "\"";
    }
    
    if (node->alt.has_value()) {
        json << ",\"alt\":\"" << escapeJson(node->alt.value()) << "\"";
    }
    
    if (node->language.has_value()) {
        json << ",\"language\":\"" << escapeJson(node->language.value()) << "\"";
    }
    
    if (node->ordered.has_value()) {
        json << ",\"ordered\":" << (node->ordered.value() ? "true" : "false");
    }
    
    if (node->start.has_value()) {
        json << ",\"start\":" << node->start.value();
    }
    
    if (node->checked.has_value()) {
        json << ",\"checked\":" << (node->checked.value() ? "true" : "false");
    }
    
    if (node->isHeader.has_value()) {
        json << ",\"isHeader\":" << (node->isHeader.value() ? "true" : "false");
    }
    
    if (node->align.has_value()) {
        std::string alignStr = ::NitroMarkdown::textAlignToString(node->align.value());
        if (!alignStr.empty()) {
            json << ",\"align\":\"" << alignStr << "\"";
        }
    }

    if (!node->children.empty()) {
        json << ",\"children\":[";
        for (size_t i = 0; i < node->children.size(); ++i) {
            if (i > 0) json << ",";
            json << nodeToJson(node->children[i]);
        }
        json << "]";
    }
    
    json << "}";
    return json.str();
}

} // namespace margelo::nitro::Markdown
