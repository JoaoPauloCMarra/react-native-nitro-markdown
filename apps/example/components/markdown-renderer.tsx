import React, { useState, useLayoutEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Linking,
  Image,
  type LayoutChangeEvent,
} from 'react-native';
import MathJax from 'react-native-mathjax-svg';
import type { MarkdownNode } from 'react-native-nitro-markdown';

interface MarkdownRendererProps {
  node: MarkdownNode;
  depth?: number;
}

function getTextContent(node: MarkdownNode): string {
  if (node.content) return node.content;
  if (!node.children) return '';
  return node.children.map(getTextContent).join('');
}

const colors = {
  background: '#0a0a0a',
  surface: '#151515',
  surfaceLight: '#1a1a1a',
  border: '#252525',
  text: '#e0e0e0',
  textMuted: '#888',
  heading: '#f0f0f0',
  link: '#60a5fa',
  code: '#fbbf24',
  codeBackground: '#1a1a2e',
  math: '#c084fc',
  mathBackground: '#1e1a2e',
  accent: '#4ade80',
  danger: '#f87171',
  tableHeader: '#0f172a',
  tableHeaderText: '#94a3b8',
  tableBorder: '#334155',
  tableRowEven: '#0f172a',
  tableRowOdd: '#1e293b',
  blockquote: '#3b82f6',
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  node,
  depth = 0,
}) => {
  const renderChildren = (children?: MarkdownNode[]) => {
    if (!children || children.length === 0) return null;
    return children.map((child, index) => (
      <MarkdownRenderer key={`${child.type}-${index}`} node={child} depth={depth + 1} />
    ));
  };

  switch (node.type) {
    case 'document':
      return <View style={styles.document}>{renderChildren(node.children)}</View>;

    case 'heading': {
      const level = node.level ?? 1;
      const headingStyles = [
        styles.heading,
        level === 1 && styles.h1,
        level === 2 && styles.h2,
        level === 3 && styles.h3,
        level === 4 && styles.h4,
        level === 5 && styles.h5,
        level === 6 && styles.h6,
      ];
      return (
        <Text style={headingStyles}>
          {renderChildren(node.children)}
        </Text>
      );
    }

    case 'paragraph':
      return (
        <Text style={styles.paragraph}>
          {renderChildren(node.children)}
        </Text>
      );

    case 'text':
      return <Text style={styles.text}>{node.content}</Text>;

    case 'bold':
      return (
        <Text style={styles.bold}>
          {renderChildren(node.children)}
        </Text>
      );

    case 'italic':
      return (
        <Text style={styles.italic}>
          {renderChildren(node.children)}
        </Text>
      );

    case 'strikethrough':
      return (
        <Text style={styles.strikethrough}>
          {renderChildren(node.children)}
        </Text>
      );

    case 'link': {
      const handlePress = () => {
        if (node.href) {
          Linking.openURL(node.href);
        }
      };
      return (
        <Text style={styles.link} onPress={handlePress}>
          {renderChildren(node.children)}
        </Text>
      );
    }

    case 'image': {
      const imageUrl = node.href;
      if (!imageUrl) return null;
      return (
        <ImageRenderer 
          url={imageUrl} 
          title={node.title} 
          alt={node.content}
        />
      );
    }

    case 'code_inline':
      return (
        <Text style={styles.codeInline}>
          {node.content}
        </Text>
      );

    case 'code_block':
      return (
        <View style={styles.codeBlock}>
          {node.language && (
            <Text style={styles.codeLanguage}>{node.language}</Text>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text style={styles.codeBlockText}>
              {getTextContent(node)}
            </Text>
          </ScrollView>
        </View>
      );

    case 'blockquote':
      return (
        <View style={styles.blockquote}>
          {renderChildren(node.children)}
        </View>
      );

    case 'horizontal_rule':
      return <View style={styles.horizontalRule} />;

    case 'line_break':
      return <Text>{'\n'}</Text>;

    case 'soft_break':
      return <Text> </Text>;

    case 'table':
      return <TableRenderer node={node} />;

    case 'table_head':
    case 'table_body':
    case 'table_row':
    case 'table_cell':
      return null;

    case 'list': {
      return (
        <View style={[styles.list, depth > 0 && styles.listNested]}>
          {node.children?.map((child, index) => (
            <ListItemWrapper
              key={`list-item-${index}`}
              node={child}
              index={index}
              ordered={node.ordered ?? false}
              start={node.start ?? 1}
              depth={depth}
            />
          ))}
        </View>
      );
    }

    case 'list_item':
      return (
        <View style={styles.listItemContent}>
          {renderChildren(node.children)}
        </View>
      );

    case 'task_list_item':
      return (
        <View style={styles.taskListItem}>
          <Text style={styles.taskCheckbox}>
            {node.checked ? '☑' : '☐'}
          </Text>
          <View style={styles.taskContent}>
            {renderChildren(node.children)}
          </View>
        </View>
      );

    case 'math_inline': {
      let mathContent = getTextContent(node);
      if (!mathContent) return null;
      // Strip any existing $ delimiters from content
      mathContent = mathContent.replace(/^\$+|\$+$/g, '').trim();
      return (
        <View style={styles.mathInlineContainer}>
          <MathJax fontSize={16} color={colors.math} fontCache>
            {mathContent}
          </MathJax>
        </View>
      );
    }

    case 'math_block': {
      let mathContent = getTextContent(node);
      if (!mathContent) return null;
      // Strip any existing $$ delimiters from content
      mathContent = mathContent.replace(/^\$+|\$+$/g, '').trim();
      return (
        <View style={styles.mathBlock}>
          <MathJax fontSize={20} color={colors.math} fontCache>
            {`\\displaystyle ${mathContent}`}
          </MathJax>
        </View>
      );
    }

    case 'html_block':
    case 'html_inline':
      return (
        <Text style={styles.htmlStub}>
          {node.content || '[HTML]'}
        </Text>
      );

    default:
      return (
        <Text style={styles.unknown}>
          [{node.type}]
          {renderChildren(node.children)}
        </Text>
      );
  }
};

interface TableData {
  headers: MarkdownNode[];
  rows: MarkdownNode[][];
  alignments: (string | undefined)[];
}

function extractTableData(node: MarkdownNode): TableData {
  const headers: MarkdownNode[] = [];
  const rows: MarkdownNode[][] = [];
  const alignments: (string | undefined)[] = [];

  for (const child of node.children ?? []) {
    if (child.type === 'table_head') {
      for (const row of child.children ?? []) {
        if (row.type === 'table_row') {
          for (const cell of row.children ?? []) {
            headers.push(cell);
            alignments.push(cell.align);
          }
        }
      }
    } else if (child.type === 'table_body') {
      for (const row of child.children ?? []) {
        if (row.type === 'table_row') {
          const rowCells: MarkdownNode[] = [];
          for (const cell of row.children ?? []) {
            rowCells.push(cell);
          }
          rows.push(rowCells);
        }
      }
    }
  }

  return { headers, rows, alignments };
}

function getCellText(node: MarkdownNode): string {
  if (node.content) return node.content;
  let text = '';
  for (const child of node.children ?? []) {
    text += getCellText(child);
  }
  return text;
}

const TableRenderer: React.FC<{ node: MarkdownNode }> = ({ node }) => {
  const { headers, rows, alignments } = extractTableData(node);
  const columnCount = headers.length;
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const measuredWidths = useRef<Map<string, number>>(new Map());
  const pendingMeasurements = useRef<number>(0);
  const totalCells = columnCount + (rows.length * columnCount);

  const handleCellLayout = useCallback((colIndex: number, cellKey: string, width: number) => {
    measuredWidths.current.set(cellKey, width);
    pendingMeasurements.current++;

    if (pendingMeasurements.current >= totalCells) {
      const maxWidths: number[] = new Array(columnCount).fill(0);
      
      measuredWidths.current.forEach((w, key) => {
        const col = parseInt(key.split('-')[1], 10);
        if (!isNaN(col) && col < columnCount) {
          maxWidths[col] = Math.max(maxWidths[col], w);
        }
      });
      
      setColumnWidths(maxWidths);
    }
  }, [columnCount, totalCells]);

  const getAlignment = (index: number): 'flex-start' | 'center' | 'flex-end' => {
    const align = alignments[index];
    if (align === 'center') return 'center';
    if (align === 'right') return 'flex-end';
    return 'flex-start';
  };

  const getTextAlign = (index: number): 'left' | 'center' | 'right' => {
    const align = alignments[index];
    if (align === 'center') return 'center';
    if (align === 'right') return 'right';
    return 'left';
  };

  const hasWidths = columnWidths.length === columnCount;

  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={true}
      style={styles.tableContainer}
      contentContainerStyle={styles.tableContentContainer}
    >
      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          {headers.map((cell, colIndex) => (
            <View
              key={`header-${colIndex}`}
              style={[
                styles.tableHeaderCell,
                hasWidths && { width: columnWidths[colIndex] },
                { alignItems: getAlignment(colIndex) },
                colIndex === 0 && styles.tableFirstCell,
                colIndex === columnCount - 1 && styles.tableLastCell,
              ]}
              onLayout={(e: LayoutChangeEvent) => {
                if (!hasWidths) {
                  handleCellLayout(colIndex, `header-${colIndex}`, e.nativeEvent.layout.width);
                }
              }}
            >
              <Text style={[styles.tableHeaderText, { textAlign: getTextAlign(colIndex) }]}>
                <CellContent node={cell} />
              </Text>
            </View>
          ))}
        </View>

        {rows.map((row, rowIndex) => (
          <View 
            key={`row-${rowIndex}`} 
            style={[
              styles.tableBodyRow,
              rowIndex % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd,
              rowIndex === rows.length - 1 && styles.tableLastRow,
            ]}
          >
            {row.map((cell, colIndex) => (
              <View
                key={`cell-${rowIndex}-${colIndex}`}
                style={[
                  styles.tableBodyCell,
                  hasWidths && { width: columnWidths[colIndex] },
                  { alignItems: getAlignment(colIndex) },
                  colIndex === 0 && styles.tableFirstCell,
                  colIndex === columnCount - 1 && styles.tableLastCell,
                ]}
                onLayout={(e: LayoutChangeEvent) => {
                  if (!hasWidths) {
                    handleCellLayout(colIndex, `cell-${rowIndex}-${colIndex}`, e.nativeEvent.layout.width);
                  }
                }}
              >
                <Text style={[styles.tableCellText, { textAlign: getTextAlign(colIndex) }]}>
                  <CellContent node={cell} />
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const CellContent: React.FC<{ node: MarkdownNode }> = ({ node }) => {
  if (!node.children || node.children.length === 0) {
    return <>{node.content || ''}</>;
  }

  return (
    <>
      {node.children.map((child, index) => (
        <CellChildRenderer key={index} node={child} />
      ))}
    </>
  );
};

const CellChildRenderer: React.FC<{ node: MarkdownNode }> = ({ node }) => {
  switch (node.type) {
    case 'text':
      return <Text>{node.content}</Text>;
    case 'bold':
      return (
        <Text style={styles.bold}>
          <CellContent node={node} />
        </Text>
      );
    case 'italic':
      return (
        <Text style={styles.italic}>
          <CellContent node={node} />
        </Text>
      );
    case 'code_inline':
      return <Text style={styles.codeInline}>{node.content}</Text>;
    case 'link':
      return (
        <Text 
          style={styles.link} 
          onPress={() => node.href && Linking.openURL(node.href)}
        >
          <CellContent node={node} />
        </Text>
      );
    default:
      return <CellContent node={node} />;
  }
};

const ImageRenderer: React.FC<{ url: string; title?: string; alt?: string }> = ({ 
  url, 
  title, 
  alt 
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <View style={styles.imageError}>
        <Text style={styles.imageErrorText}>🖼️ {alt || title || 'Image failed to load'}</Text>
        <Text style={styles.imageErrorUrl}>{url}</Text>
      </View>
    );
  }

  return (
    <View style={styles.imageContainer}>
      {loading && (
        <View style={styles.imageLoading}>
          <Text style={styles.imageLoadingText}>Loading image...</Text>
        </View>
      )}
      <Image
        source={{ uri: url }}
        style={[styles.image, loading && styles.imageHidden]}
        resizeMode="contain"
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
      />
      {title && !loading && (
        <Text style={styles.imageCaption}>{title}</Text>
      )}
    </View>
  );
};

const ListItemWrapper: React.FC<{
  node: MarkdownNode;
  index: number;
  ordered: boolean;
  start: number;
  depth: number;
}> = ({ node, index, ordered, start, depth }) => {
  const isTask = node.type === 'task_list_item';
  
  if (isTask) {
    return <MarkdownRenderer node={node} depth={depth + 1} />;
  }

  const bullet = ordered ? `${start + index}.` : '•';
  
  return (
    <View style={styles.listItem}>
      <Text style={styles.listBullet}>{bullet}</Text>
      <View style={styles.listItemContent}>
        <MarkdownRenderer node={node} depth={depth + 1} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  document: {
    flex: 1,
  },

  heading: {
    color: colors.heading,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 12,
  },
  h1: {
    fontSize: 32,
    lineHeight: 40,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
  },
  h2: {
    fontSize: 26,
    lineHeight: 34,
  },
  h3: {
    fontSize: 22,
    lineHeight: 30,
  },
  h4: {
    fontSize: 18,
    lineHeight: 26,
  },
  h5: {
    fontSize: 16,
    lineHeight: 24,
  },
  h6: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
  },

  paragraph: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 16,
  },
  text: {
    color: colors.text,
  },
  bold: {
    fontWeight: '700',
    color: colors.text,
  },
  italic: {
    fontStyle: 'italic',
    color: colors.text,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },

  link: {
    color: colors.link,
    textDecorationLine: 'underline',
  },

  imageContainer: {
    marginVertical: 12,
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  imageHidden: {
    opacity: 0,
    position: 'absolute',
  },
  imageLoading: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageLoadingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  imageError: {
    width: '100%',
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    marginVertical: 12,
  },
  imageErrorText: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: 4,
  },
  imageErrorUrl: {
    color: colors.textMuted,
    fontSize: 10,
    opacity: 0.6,
  },
  imageCaption: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  codeInline: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: colors.code,
    backgroundColor: colors.codeBackground,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  codeBlock: {
    backgroundColor: colors.codeBackground,
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#2d2d4a',
  },
  codeLanguage: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codeBlockText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.text,
    lineHeight: 22,
  },

  blockquote: {
    borderLeftWidth: 4,
    borderLeftColor: colors.blockquote,
    paddingLeft: 16,
    marginVertical: 12,
    backgroundColor: colors.surfaceLight,
    paddingVertical: 8,
    paddingRight: 16,
    borderRadius: 4,
  },

  horizontalRule: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 24,
  },

  tableContainer: {
    marginVertical: 16,
  },
  tableContentContainer: {
    paddingRight: 16,
  },
  table: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.tableBorder,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.tableHeader,
    borderBottomWidth: 2,
    borderBottomColor: colors.tableBorder,
  },
  tableHeaderCell: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 80,
    borderRightWidth: 1,
    borderRightColor: colors.tableBorder,
  },
  tableHeaderText: {
    color: colors.tableHeaderText,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableBodyRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.tableBorder,
  },
  tableRowEven: {
    backgroundColor: colors.tableRowEven,
  },
  tableRowOdd: {
    backgroundColor: colors.tableRowOdd,
  },
  tableLastRow: {
    borderBottomWidth: 0,
  },
  tableBodyCell: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 80,
    borderRightWidth: 1,
    borderRightColor: colors.tableBorder,
    justifyContent: 'center',
  },
  tableFirstCell: {},
  tableLastCell: {
    borderRightWidth: 0,
  },
  tableCellText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },

  list: {
    marginBottom: 12,
  },
  listNested: {
    marginLeft: 16,
    marginBottom: 0,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  listBullet: {
    color: colors.accent,
    fontSize: 16,
    marginRight: 8,
    minWidth: 20,
  },
  listItemContent: {
    flex: 1,
  },

  taskListItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  taskCheckbox: {
    fontSize: 18,
    marginRight: 8,
    color: colors.accent,
  },
  taskContent: {
    flex: 1,
  },

  mathInlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  mathBlock: {
    backgroundColor: colors.mathBackground,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3d2d6a',
    minHeight: 60,
  },

  htmlStub: {
    color: colors.danger,
    fontFamily: 'monospace',
    fontSize: 12,
  },

  unknown: {
    color: colors.danger,
    fontSize: 12,
  },
});
