'use client';

import { Suspense } from 'react';
import { PostsScreen } from '@/features/components/features/marketing/posts-screen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PostsScreen />
    </Suspense>
  );
}
