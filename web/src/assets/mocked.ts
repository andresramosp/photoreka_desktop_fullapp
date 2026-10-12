export interface ProcessingJob {
  id: string;
  startDate: Date;
  photoCount: number;
  processType: string;
  status: "processing" | "finished";
  progress: number;
  expanded: boolean;
  photos: {
    id: string;
    name: string;
    url: string;
    processed: boolean;
  }[];
}

export interface CatalogPhoto {
  id: string;
  name: string;
  size: string;
  url: string;
  date: string;
  isDuplicate: boolean;
}

export const mockedPhotos: CatalogPhoto[] = [
  {
    id: "catalog-1",
    name: "mountain-landscape.jpg",
    size: "2.3 MB",
    url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=600",
    date: "Nov 15, 2024",
    isDuplicate: false,
  },
  {
    id: "catalog-2",
    name: "city-skyline.jpg",
    size: "1.8 MB",
    url: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=600&h=600",
    date: "Nov 14, 2024",
    isDuplicate: false,
  },
  {
    id: "catalog-3",
    name: "beach-sunset.jpg",
    size: "3.1 MB",
    url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=600",
    date: "Nov 13, 2024",
    isDuplicate: false,
  },
  {
    id: "catalog-4",
    name: "forest-path.jpg",
    size: "2.7 MB",
    url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=600",
    date: "Nov 12, 2024",
    isDuplicate: false,
  },
  {
    id: "catalog-5",
    name: "mountain-lake.jpg",
    size: "2.9 MB",
    url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=600&brightness=0.8",
    date: "Nov 11, 2024",
    isDuplicate: true,
  },
  {
    id: "catalog-6",
    name: "urban-street.jpg",
    size: "1.5 MB",
    url: "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=600&h=600",
    date: "Nov 10, 2024",
    isDuplicate: false,
  },
];

export const mockedJobs: ProcessingJob[] = [
  {
    id: "job-1",
    startDate: new Date("2024-11-20T14:30:00"),
    photoCount: 12,
    processType: "AI Object Detection",
    status: "processing",
    progress: 75,
    expanded: false,
    photos: [
      {
        id: "p1",
        name: "IMG_001.jpg",
        url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=100&h=100",
        processed: true,
      },
      {
        id: "p2",
        name: "IMG_002.jpg",
        url: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=100&h=100",
        processed: true,
      },
      {
        id: "p3",
        name: "IMG_003.jpg",
        url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=100&h=100",
        processed: true,
      },
      {
        id: "p4",
        name: "IMG_004.jpg",
        url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=100&h=100",
        processed: true,
      },
      {
        id: "p5",
        name: "IMG_005.jpg",
        url: "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=100&h=100",
        processed: true,
      },
      {
        id: "p6",
        name: "IMG_006.jpg",
        url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=100&h=100",
        processed: true,
      },
      {
        id: "p7",
        name: "IMG_007.jpg",
        url: "https://images.unsplash.com/photo-1540979388789-6cee28a1cdc9?w=100&h=100",
        processed: true,
      },
      {
        id: "p8",
        name: "IMG_008.jpg",
        url: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=100&h=100",
        processed: true,
      },
      {
        id: "p9",
        name: "IMG_009.jpg",
        url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=100&h=100",
        processed: true,
      },
      {
        id: "p10",
        name: "IMG_010.jpg",
        url: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=100&h=100",
        processed: false,
      },
      {
        id: "p11",
        name: "IMG_011.jpg",
        url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=100&h=100",
        processed: false,
      },
      {
        id: "p12",
        name: "IMG_012.jpg",
        url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=100&h=100",
        processed: false,
      },
    ],
  },
  {
    id: "job-2",
    startDate: new Date("2024-11-20T13:15:00"),
    photoCount: 8,
    processType: "Face Recognition",
    status: "finished",
    progress: 100,
    expanded: false,
    photos: [
      {
        id: "p13",
        name: "family_001.jpg",
        url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100",
        processed: true,
      },
      {
        id: "p14",
        name: "family_002.jpg",
        url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100",
        processed: true,
      },
      {
        id: "p15",
        name: "family_003.jpg",
        url: "https://images.unsplash.com/photo-1494790108755-2616c4ce8394?w=100&h=100",
        processed: true,
      },
      {
        id: "p16",
        name: "family_004.jpg",
        url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100",
        processed: true,
      },
      {
        id: "p17",
        name: "family_005.jpg",
        url: "https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=100&h=100",
        processed: true,
      },
      {
        id: "p18",
        name: "family_006.jpg",
        url: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100",
        processed: true,
      },
      {
        id: "p19",
        name: "family_007.jpg",
        url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100",
        processed: true,
      },
      {
        id: "p20",
        name: "family_008.jpg",
        url: "https://images.unsplash.com/photo-1463453091185-61582044d556?w=100&h=100",
        processed: true,
      },
    ],
  },
  {
    id: "job-3",
    startDate: new Date("2024-11-20T12:00:00"),
    photoCount: 45,
    processType: "Scene Classification",
    status: "processing",
    progress: 20,
    expanded: false,
    photos: [
      {
        id: "p21",
        name: "nature_001.jpg",
        url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=100&h=100",
        processed: true,
      },
      {
        id: "p22",
        name: "nature_002.jpg",
        url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=100&h=100",
        processed: true,
      },
      {
        id: "p23",
        name: "nature_003.jpg",
        url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=100&h=100",
        processed: true,
      },
      {
        id: "p24",
        name: "nature_004.jpg",
        url: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=100&h=100",
        processed: false,
      },
      {
        id: "p25",
        name: "nature_005.jpg",
        url: "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=100&h=100",
        processed: false,
      },
      {
        id: "p26",
        name: "nature_006.jpg",
        url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=100&h=100",
        processed: false,
      },
      {
        id: "p27",
        name: "nature_007.jpg",
        url: "https://images.unsplash.com/photo-1540979388789-6cee28a1cdc9?w=100&h=100",
        processed: false,
      },
      {
        id: "p28",
        name: "nature_008.jpg",
        url: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=100&h=100",
        processed: false,
      },
      {
        id: "p29",
        name: "nature_009.jpg",
        url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=100&h=100",
        processed: false,
      },
      {
        id: "p30",
        name: "nature_010.jpg",
        url: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=100&h=100",
        processed: false,
      },
      {
        id: "p31",
        name: "nature_011.jpg",
        url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=100&h=100",
        processed: false,
      },
      {
        id: "p32",
        name: "nature_012.jpg",
        url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=100&h=100",
        processed: false,
      },
      {
        id: "p33",
        name: "nature_013.jpg",
        url: "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=100&h=100",
        processed: false,
      },
      {
        id: "p34",
        name: "nature_014.jpg",
        url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=100&h=100",
        processed: false,
      },
      {
        id: "p35",
        name: "nature_015.jpg",
        url: "https://images.unsplash.com/photo-1540979388789-6cee28a1cdc9?w=100&h=100",
        processed: false,
      },
      {
        id: "p36",
        name: "nature_016.jpg",
        url: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=100&h=100",
        processed: false,
      },
      {
        id: "p37",
        name: "nature_017.jpg",
        url: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=100&h=100",
        processed: false,
      },
      {
        id: "p38",
        name: "nature_018.jpg",
        url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=100&h=100",
        processed: false,
      },
      {
        id: "p39",
        name: "nature_019.jpg",
        url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=100&h=100",
        processed: false,
      },
      {
        id: "p40",
        name: "nature_020.jpg",
        url: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=100&h=100",
        processed: false,
      },
      {
        id: "p41",
        name: "nature_021.jpg",
        url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=100&h=100",
        processed: false,
      },
      {
        id: "p42",
        name: "nature_022.jpg",
        url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=100&h=100",
        processed: false,
      },
      {
        id: "p43",
        name: "nature_023.jpg",
        url: "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=100&h=100",
        processed: false,
      },
      {
        id: "p44",
        name: "nature_024.jpg",
        url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=100&h=100",
        processed: false,
      },
      {
        id: "p45",
        name: "nature_025.jpg",
        url: "https://images.unsplash.com/photo-1540979388789-6cee28a1cdc9?w=100&h=100",
        processed: false,
      },
      {
        id: "p46",
        name: "nature_026.jpg",
        url: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=100&h=100",
        processed: false,
      },
      {
        id: "p47",
        name: "nature_027.jpg",
        url: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=100&h=100",
        processed: false,
      },
      {
        id: "p48",
        name: "nature_028.jpg",
        url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=100&h=100",
        processed: false,
      },
      {
        id: "p49",
        name: "nature_029.jpg",
        url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=100&h=100",
        processed: false,
      },
      {
        id: "p50",
        name: "nature_030.jpg",
        url: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=100&h=100",
        processed: false,
      },
      {
        id: "p51",
        name: "nature_031.jpg",
        url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=100&h=100",
        processed: false,
      },
      {
        id: "p52",
        name: "nature_032.jpg",
        url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=100&h=100",
        processed: false,
      },
      {
        id: "p53",
        name: "nature_033.jpg",
        url: "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=100&h=100",
        processed: false,
      },
      {
        id: "p54",
        name: "nature_034.jpg",
        url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=100&h=100",
        processed: false,
      },
      {
        id: "p55",
        name: "nature_035.jpg",
        url: "https://images.unsplash.com/photo-1540979388789-6cee28a1cdc9?w=100&h=100",
        processed: false,
      },
      {
        id: "p56",
        name: "nature_036.jpg",
        url: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=100&h=100",
        processed: false,
      },
      {
        id: "p57",
        name: "nature_037.jpg",
        url: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=100&h=100",
        processed: false,
      },
      {
        id: "p58",
        name: "nature_038.jpg",
        url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=100&h=100",
        processed: false,
      },
      {
        id: "p59",
        name: "nature_039.jpg",
        url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=100&h=100",
        processed: false,
      },
      {
        id: "p60",
        name: "nature_040.jpg",
        url: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=100&h=100",
        processed: false,
      },
      {
        id: "p61",
        name: "nature_041.jpg",
        url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=100&h=100",
        processed: false,
      },
      {
        id: "p62",
        name: "nature_042.jpg",
        url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=100&h=100",
        processed: false,
      },
      {
        id: "p63",
        name: "nature_043.jpg",
        url: "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=100&h=100",
        processed: false,
      },
      {
        id: "p64",
        name: "nature_044.jpg",
        url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=100&h=100",
        processed: false,
      },
      {
        id: "p65",
        name: "nature_045.jpg",
        url: "https://images.unsplash.com/photo-1540979388789-6cee28a1cdc9?w=100&h=100",
        processed: false,
      },
    ],
  },
];
