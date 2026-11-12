import { CULTURAL_SOURCES } from './sources';
import type { Level, LevelId, Surface, Vec3 } from '../domain/types';
import { INTERCHANGE } from './interchange';

const ground = (id: string, name: string, bounds: Surface['bounds'], y: number, neighbors: string[], layer = '街巷'): Surface =>
  ({ id, name, bounds, origin: [bounds[0], y, bounds[2]], gradient: [0, 0], terrain: 'flat', neighbors, layer });
const stairs = (id: string, bounds: Surface['bounds'], origin: Vec3, gradient: [number, number], neighbors: string[]): Surface =>
  ({ id, name: '山城梯道', bounds, origin, gradient, terrain: 'stairs', neighbors, layer: '梯道' });
const layersSource = CULTURAL_SOURCES.liziba.url;
export const LEVEL_IDS: LevelId[] = ['liziba', 'crown-escalator', 'yangtze-cableway', 'huangjuewan'];
export const LEVELS: Level[] = [
  {
    id: 'liziba', number: 1, name: '李子坝', subtitle: '坐进穿楼风景，再从街头回望',
    intro: '从佛图关站附近的下层街巷出发：沿梯道上行，或找直梯接上站前步道。到佛图关站乘坐2号线，往较场口方向到李子坝下车，再沿出站梯道走向观景平台。',
    goalName: '李子坝观景平台', start: { surface: 'quay', position: [-26, 0, 10] },
    goal: { surface: 'liziba-plaza', position: [12, 0, 14] },
    center: [-3, 5, 0], viewSize: 44, accent: '#df805b',
    surfaces: [
      ground('quay', '佛图关站附近街巷', [-32, -12, 5, 14], 0, ['steps']),
      stairs('steps', [-29, -25, -3, 5], [-29, 0, 5], [0, -0.75], ['quay', 'terrace']),
      ground('terrace', '佛图关站前', [-32, -13, -7, -3], 6, ['steps', 'skywalk'], '出发站'),
      ground('skywalk', '直梯上层接驳步道', [-17, -13, -3, 12], 6, ['terrace'], '上层步道'),
      ground('arrival', '李子坝站出站平台', [2, 21, -7, 1], 6, ['arrival-steps'], '李子坝站'),
      stairs('arrival-steps', [17, 21, 1, 9], [17, 6, 1], [0, -0.75], ['arrival', 'liziba-plaza']),
      ground('liziba-plaza', '李子坝观景步道', [7, 26, 9, 18], 0, ['arrival-steps'], '出站街巷'),
    ],
    transports: [
      { id: 'liziba-lift', name: '直梯', kind: 'lift', duration: 3,
        stops: [{ name: '下层街巷', surface: 'quay', position: [-15, 0, 10] }, { name: '上层接驳步道', surface: 'skywalk', position: [-15, 6, 10] }],
        path: [[-15, 0, 10], [-15, 6, 10]] },
      { id: 'liziba-rail', name: '2号线 · 佛图关—李子坝', kind: 'rail', duration: 10, recoveryGroup: 'line-2-demo',
        stops: [
          { name: '佛图关站', surface: 'terrace', position: [-24, 6, -5], vehiclePosition: [-24, 6.65, -9.8] },
          { name: '李子坝站', surface: 'arrival', position: [12, 6, -4], vehiclePosition: [12, 6.65, -9.8] },
        ],
        path: [[-24, 6.65, -9.8], [-14, 6.65, -9.8], [-2, 6.65, -9.8], [6, 6.65, -9.8], [12, 6.65, -9.8]],
        rideView: { center: [-4, 6, -8], distance: 39, yaw: 0.28, pitch: 0.49 } },
    ],
    discoveries: [
      { id: 'liziba-building', title: '列车从楼中经过', surface: 'arrival', position: [5, 6, -3],
        text: '从佛图关方向进入李子坝，列车沿轨道驶入与建筑共构的站区。下车后回望，轨道、楼体与山地街巷的高度关系更清楚。站外道路为游戏压缩改编。',
        source: layersSource, mediaId:'liziba' },
      { id: 'liziba-quay', title: '先找入口，再看远方', surface: 'quay', position: [-20, 0, 12],
        text: '同样是前往站台，可以爬梯道，也可以找直梯再步行接驳。游戏保留山城找入口与换高度的过程；此处站外路径和电梯不作为现实导航。',
        source: layersSource, mediaId:'liziba' },
    ],
    checkpoints: [{ id: 'liziba-station', name: '佛图关站前歇脚点', surface: 'terrace', position: [-29, 6, -5], benchOffset: [0,-1.25] }],
    source: layersSource, sourceLabel: '重庆市地方志办公室 · 李子坝单轨穿楼',
    geography: '采用佛图关→李子坝、往较场口方向的相邻站顺序；两站距离、站外街巷、直梯及观景步道经过游戏压缩，不对应真实步行导航。',
  },
  {
    id: 'crown-escalator', number: 2, name: '皇冠大扶梯', subtitle: '省力直达，或走进高差里的街巷',
    intro: '朋友在上方街口等你。扶梯可省力直达；左侧梯道通向中层街巷，可继续走较陡的近路，或绕经折返梯道与歇脚平台。街巷里有扶梯沿线看不到的可选行记。',
    goalName: '上方街口', start: { surface: 'caiyuanba', position: [0, 0, 13] },
    goal: { surface: 'lianglukou', position: [8, 8, -10] },
    center: [-8, 4, 1], viewSize: 37, accent: '#c89748', staminaScale: 0.75,
    surfaces: [
      ground('caiyuanba', '下口广场', [-21, 14, 5, 17], 0, ['crown-steps']),
      stairs('crown-steps', [-16, -12, 1, 5], [-16, 0, 5], [0, -0.75], ['caiyuanba', 'crown-mid']),
      ground('crown-mid', '中层横向街巷', [-25, -9, -3, 1], 3, ['crown-steps', 'crown-short', 'crown-fold', 'crown-view'], '中层街巷'),
      ground('crown-view', '扶梯侧望平台', [-9, -4, -3, 1], 3, ['crown-mid'], '可选观景支路'),
      stairs('crown-short', [-13, -9, -7, -3], [-13, 3, -3], [0, -1.25], ['crown-mid', 'lianglukou']),
      stairs('crown-fold', [-25, -21, 1, 5], [-25, 3, 1], [0, 0.625], ['crown-mid', 'crown-turn']),
      ground('crown-turn', '折返歇脚平台', [-29, -21, 5, 9], 5.5, ['crown-fold', 'crown-upper-steps'], '折返平台'),
      stairs('crown-upper-steps', [-29, -25, -7, 5], [-29, 5.5, 5], [0, -2.5/12], ['crown-turn', 'lianglukou']),
      ground('lianglukou', '上口街巷', [-29, 14, -13, -7], 8, ['crown-short', 'crown-upper-steps'], '上口街巷'),
    ],
    transports: [{
      id: 'crown-main', name: '皇冠大扶梯', kind: 'escalator', duration: 8,
      stops: [{ name: '扶梯下口', surface: 'caiyuanba', position: [2, 0, 7] }, { name: '扶梯上口', surface: 'lianglukou', position: [2, 8, -9] }],
      path: [[2, 0, 7], [2, 8, -9]],
    }],
    discoveries: [
      { id: 'crown-height', title: '从侧面读懂山城高差', surface: 'crown-view', position: [-6, 3, -1],
        text: '离开扶梯，在中层街巷回望，能同时看到上下入口的高差。垂直交通连接日常生活；这里的折返梯道与侧望平台为游戏化改编。',
        source: CULTURAL_SOURCES.crown.url, mediaId:'crown' },
      { id: 'crown-lanes', title: '转折里的歇脚处', surface: 'crown-turn', position: [-26, 5.5, 7],
        text: '折返梯道以更长的路程分配爬升，平台提供停步、辨向和歇脚的空间。选择绕路，可以发现直达扶梯以外的山城步行体验。',
        source: CULTURAL_SOURCES.crown.url, mediaId:'crown' },
      { id: 'crown-machine', title: '扶梯与直梯不一样', surface: 'caiyuanba', position: [9, 0, 8],
        text: '扶梯沿倾斜方向连续运送，直梯则垂直升降。在游戏里，两者都不消耗步行体力；扶梯保留省力直达的价值，街巷则提供独有发现。',
        source: CULTURAL_SOURCES.crown.url, mediaId:'crown' },
    ],
    checkpoints: [
      { id: 'crown-mid-rest', name: '中层街巷歇脚点', surface: 'crown-mid', position: [-17, 3, -1] },
      { id: 'crown-turn-rest', name: '折返平台歇脚点', surface: 'crown-turn', position: [-26, 5.5, 7], benchOffset: [0,1.3] },
      { id: 'crown-upper', name: '扶梯上口歇脚点', surface: 'lianglukou', position: [0, 8, -10] },
    ],
    source: CULTURAL_SOURCES.crown.url, sourceLabel: '重庆市人民政府网 · 皇冠大扶梯',
    geography: '保留扶梯连接两路口与菜园坝高差的关系；大厅净空适当夸张，站外折返梯道、街巷、支路为游戏化改编。',
  },
  {
    id: 'yangtze-cableway', number: 3, name: '长江索道', subtitle: '越过江面，再赴一场约',
    intro: '朋友在对岸步道等你。走上站前梯道，找到索道入口；跨江时可以安心看风景，下站后还要继续走一小段。',
    goalName: '对岸步道', start: { surface: 'north-street', position: [-11, 2, 6] },
    goal: { surface: 'south-street', position: [25, 2, -1] },
    center: [7, 3, 1], viewSize: 36, accent: '#608d85',
    surfaces: [
      ground('north-street', '北岸街巷', [-14, -5, -5, 9], 2, ['north-steps']),
      stairs('north-steps', [-5, -1, 3, 7], [-5, 2, 3], [1, 0], ['north-street', 'north-station']),
      ground('north-station', '北岸站前', [-1, 3, 2, 9], 6, ['north-steps'], '站前平台'),
      ground('south-station', '南岸站前', [13, 19, 0, 9], 6, ['south-steps'], '站前平台'),
      stairs('south-steps', [19, 23, 2, 6], [19, 6, 2], [-1, 0], ['south-station', 'south-street']),
      ground('south-street', '对岸步道', [23, 28, -5, 10], 2, ['south-steps']),
    ],
    transports: [{
      id: 'yangtze-main', name: '长江索道', kind: 'cableway', duration: 10,
      stops: [{ name: '北岸站前', surface: 'north-station', position: [1, 6, 7], vehiclePosition:[1,6,5] }, { name: '南岸站前', surface: 'south-station', position: [16, 6, 7], vehiclePosition:[16,6,5] }],
      path: [[1, 6, 5], [4, 7.5, 4], [8.5, 7, 4], [13, 7.5, 4], [16, 6, 5]],
      rideView: { center:[8.5,5,3], distance:31, yaw:0.2, pitch:0.65 },
    }],
    discoveries: [
      { id: 'cableway-north', title: '跨江，也连接生活', surface: 'north-street', position: [-11, 2, -2],
        text: '长江索道是重庆跨江交通的代表性地标。找站口与两岸接驳，也是理解它和城市生活关系的一部分。',
        source: CULTURAL_SOURCES.cableway.url, mediaId:'cableway' },
      { id: 'cableway-south', title: '从对岸回望山城', surface: 'south-street', position: [25, 2, 8],
        text: '站在对岸，江面、岸线与层叠建筑成为一个整体。游戏压缩了乘坐距离和两端街区，让你保留找路与观察的过程。',
        source: CULTURAL_SOURCES.cableway.url, mediaId:'cableway' },
    ],
    checkpoints: [{ id: 'cableway-south-stop', name: '南岸站前歇脚点', surface: 'south-station', position: [17, 6, 7.5], benchOffset:[1.25,0] }],
    source: CULTURAL_SOURCES.cableway.url, sourceLabel: '重庆市人民政府网 · 长江索道',
    geography: '表现两岸连接与跨江观景；站前路线、地形与距离为游戏简化，非完整实景复刻。',
  },
  INTERCHANGE,
];
export const getLevel = (id: LevelId): Level => LEVELS.find(level => level.id === id)!;
