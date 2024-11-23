const path = require('path');
const JSDOM = require('jsdom').JSDOM;
const parse = require('@vue/compiler-sfc').parse;

const { v4: uuidv4 } = require('uuid');

const dealFile = [];
const fileClassName = [];

function generateShortUUID() {
  return uuidv4().replace(/-/g, '').substring(0, 6);
}

function getWrapperClassName(filePath) {
  if (!dealFile.includes(filePath)) {
    const className = `v-scoped-${generateShortUUID()}`;
    dealFile.push(filePath);
    fileClassName.push({
      file: filePath,
      className,
    });
    return className;
  }
  return fileClassName.find((item) => item.file === filePath).className;
}
function processTemplateContent(templateElement, wrapperClassName) {
  const dom = new JSDOM();
  const wrapperDiv = dom.window.document.createElement('div');
  wrapperDiv.classList.add(wrapperClassName);
  while (templateElement.firstChild) {
    wrapperDiv.appendChild(templateElement.firstChild);
  }
  templateElement.innerHTML = '';
  templateElement.appendChild(wrapperDiv);
  return templateElement.innerHTML;
}
function fixedTemplate(content) {
  // 定义一个函数来转换标签名称
  function convertTagName(tagName) {
    return tagName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }
  // 使用一个正则表达式一次性匹配所有标签
  content = content.replace(/<([A-Za-z0-9-]+)(\s[^>]*)?(\/?)>/gi, (match, p1, p2, p3) => {
    const convertedTag = convertTagName(p1);
    // 如果是自闭合标签，直接返回成对标签
    if (p3.trim() === '/') {
      return `<${convertedTag}${p2 ? p2 : ''}></${convertedTag}>`;
    } else {
      // 如果是成对标签，直接返回成对标签
      return `<${convertedTag}${p2 ? p2 : ''}>`;
    }
  });
  // 处理成对标签的闭合部分
  content = content.replace(/<\/([A-Za-z0-9-]+)>/gi, (match, p1) => {
    const convertedTag = convertTagName(p1);
    return `</${convertedTag}>`;
  });

  // 特殊处理自闭合标签带空格和属性的情况
  content = content.replace(/<([A-Za-z0-9-]+)(\s[^>]*)?\/>/gi, (match, p1, p2) => {
    const convertedTag = convertTagName(p1);
    return `<${convertedTag}${p2 ? p2 : ''}></${convertedTag}>`;
  });

  return content;
}

module.exports = function (source) {
  const filePath = this.resourcePath;
  const wrapperClassName = getWrapperClassName(filePath);
  const { descriptor } = parse(source, { filename: filePath });

  if (descriptor.template) {
    const tempLateContent = fixedTemplate(descriptor.template.content);
    const dom = new JSDOM(`<body>${tempLateContent}</body>`);
    const templateElement = dom.window.document.body;
    if (!/v-scoped/.test(templateElement.firstElementChild.className)) {
      descriptor.template.content = processTemplateContent(templateElement, wrapperClassName);
    } else {
      descriptor.template.content = templateElement.innerHTML;
    }

    const newContent = [`<template>${descriptor.template.content}</template>`];
    if (descriptor.scriptSetup) {
      newContent.push(
        `<script setup${
          descriptor.scriptSetup.attrs.lang ? ` lang="${descriptor.scriptSetup.attrs.lang}"` : ''
        }>${descriptor.scriptSetup.content}</script>`,
      );
    } else {
      newContent.push(
        `<script setup${
          descriptor.script?.attrs.lang ? ` lang="${descriptor.script.attrs.lang}"` : ''
        }></script>`,
      );
    }

    if (descriptor.styles.length === 0) {
      newContent.push('<style lang="less"></style>');
    } else {
      descriptor.styles.forEach((style) => {
        const scopedStyleContent = `\n.${wrapperClassName} {${style.content}}\n`;
        const indentedContent = scopedStyleContent
          .split('\n')
          .map((line, index, arr) => {
            if (
              index === 0 ||
              index === 1 ||
              index === arr.length - 2 ||
              index === arr.length - 1
            ) {
              return line;
            }
            return `  ${line}`;
          })
          .join('\n');

        if (style.scoped) {
          newContent.push(
            `<style${
              style.attrs.lang ? ` lang="${style.attrs.lang}"` : ''
            }>${indentedContent}</style>`,
          );
        } else {
          newContent.push(
            `<style${style.attrs.lang ? ` lang="${style.attrs.lang}"` : ''}>${
              style.content
            }</style>`,
          );
        }
      });
    }
    return `${newContent.join('\n\n')}\n`;
  } else {
    return source;
  }
};
