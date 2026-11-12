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
  liziba:{id:'liziba',kind:'ai-illustration',alt:'李子坝轨道穿楼空间',author:'',license:'',source:CULTURAL_SOURCES.liziba.url},
  crown:{id:'crown',kind:'ai-illustration',alt:'皇冠大扶梯室内长坡与连续梯级',author:'',license:'',source:CULTURAL_SOURCES.crown.url},
  cableway:{id:'cableway',kind:'ai-illustration',alt:'长江索道红色轿厢、江面与两岸建筑',author:'',license:'',source:CULTURAL_SOURCES.cableway.url},
  huangjuewan:{id:'huangjuewan',kind:'ai-illustration',alt:'黄桷湾立交多层道路交织',author:'',license:'',source:CULTURAL_SOURCES.huangjuewan.url},
};
