import { CULTURAL_SOURCES } from './sources';
export interface LandmarkMedia {
  id:string;
  /** Only local, cleared-for-distribution media belong in this manifest. */
  src?:string;
  kind:'photo'|'ai-illustration';
  alt:string;
  author:string;
  license:string;
  source:string;
}
export const LANDMARK_MEDIA:Record<string,LandmarkMedia>={
  liziba:{id:'liziba',src:'media/liziba.webp',kind:'ai-illustration',alt:'李子坝轨道穿楼空间的 AI 示意图',author:'项目提供',license:'',source:CULTURAL_SOURCES.liziba.url},
  crown:{id:'crown',src:'media/crown.webp',kind:'ai-illustration',alt:'皇冠大扶梯室内长坡与连续梯级的 AI 示意图',author:'项目提供',license:'',source:CULTURAL_SOURCES.crown.url},
  cableway:{id:'cableway',src:'media/cableway.webp',kind:'ai-illustration',alt:'长江索道红色轿厢、江面与两岸建筑的 AI 示意图',author:'项目提供',license:'',source:CULTURAL_SOURCES.cableway.url},
  huangjuewan:{id:'huangjuewan',src:'media/huangjuewan.webp',kind:'ai-illustration',alt:'黄桷湾立交多层道路交织的 AI 示意图',author:'项目提供',license:'',source:CULTURAL_SOURCES.huangjuewan.url},
};
