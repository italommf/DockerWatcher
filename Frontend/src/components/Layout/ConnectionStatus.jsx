import React from 'react'
import { Box, Typography } from '@mui/material'

export default function ConnectionStatus({ status }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: status.ssh ? '#10B981' : '#EF4444',
            boxShadow: status.ssh ? '0 0 8px #10B981' : '0 0 8px #EF4444',
          }}
        />
        <Typography variant="body2" sx={{ color: '#CBD5E1' }}>
          SSH
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: status.mysql ? '#10B981' : '#EF4444',
            boxShadow: status.mysql ? '0 0 8px #10B981' : '0 0 8px #EF4444',
          }}
        />
        <Typography variant="body2" sx={{ color: '#CBD5E1' }}>
          MySQL
        </Typography>
      </Box>
    </Box>
  )
}
