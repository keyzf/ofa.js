import lm from "../drill.js/base.mjs";
import $ from "../xhear/base.mjs";
import { isFunction, toDashCase } from "../xhear/public.mjs";
import { dispatchLoad } from "./page.mjs";
import { drawUrl } from "./draw-template.mjs";
import { fixRelatePathContent, resolvePath } from "./public.mjs";
import { initLink } from "./link.mjs";

const COMP = Symbol("Component");
export const COMPONENT_PATH = Symbol("PATH");

Object.defineProperty($, "COMP", {
  value: COMP,
});

const cacheComps = {};

lm.use(["html", "htm"], async (ctx, next) => {
  const { result: content, params } = ctx;

  if (
    content &&
    /<template +component *>/.test(content) &&
    !params.includes("-ignore-temp")
  ) {
    try {
      const url = await drawUrl(content, ctx.url, false);
      ctx.result = await lm()(`${url} .mjs`);
    } catch (err) {
      const error = new Error(
        `Error loading Component module: ${ctx.url}\n ${err.stack}`
      );

      throw error;
    }
    ctx.resultContent = content;
  }

  await next();
});

lm.use(["js", "mjs"], async ({ result: moduleData, url }, next) => {
  if (typeof moduleData !== "object" || moduleData.type !== COMP) {
    next();
    return;
  }

  let finnalDefault = {};

  const { default: defaultData, PATH } = moduleData;

  const path = PATH || url;

  if (isFunction(defaultData)) {
    finnalDefault = await defaultData({
      load: lm({
        url: path,
      }),
    });
  } else if (defaultData instanceof Object) {
    finnalDefault = { ...defaultData };
  }

  const { tag, temp } = { ...moduleData, ...finnalDefault };

  let tagName = tag;
  const matchName = path.match(/\/([^/]+)\.m?(js|htm|html)$/);

  if (!tagName) {
    if (matchName) {
      tagName = toDashCase(matchName[1]);
    }
  }

  const cacheUrl = cacheComps[tagName];
  if (cacheUrl) {
    if (path !== cacheUrl) {
      throw `${tagName} components have been registered`;
    }

    await next();
    return;
  }

  cacheComps[tagName] = path;

  let tempUrl, tempContent;

  if (/<.+>/.test(temp)) {
    tempUrl = path;
    tempContent = temp;
  } else {
    if (!temp) {
      tempUrl = resolvePath(`${matchName[1]}.html`, path);
    } else {
      tempUrl = resolvePath(temp, path);
    }

    tempContent = await fetch(tempUrl).then((e) => e.text());
  }

  const registerOpts = {
    ...moduleData,
    ...finnalDefault,
  };

  const oldReady = registerOpts.ready;
  const { loaded } = registerOpts;
  registerOpts.ready = async function (...args) {
    oldReady && oldReady.apply(this, args);
    loaded && dispatchLoad(this, loaded);
    initLink(this.shadow);
  };

  const oldCreated = registerOpts.created;
  registerOpts.created = function (...args) {
    this[COMPONENT_PATH] = registerOpts.PATH;
    oldCreated && oldCreated.call(this, ...args);
  };

  const regTemp = fixRelatePathContent(tempContent, PATH || tempUrl);

  $.register({
    ...registerOpts,
    tag: tagName,
    temp: regTemp,
  });

  await next();
});
