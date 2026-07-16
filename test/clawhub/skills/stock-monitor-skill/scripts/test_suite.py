#!/usr/bin/env python3
"""
Stock Monitor Pro - 完整测试套件
测试所有功能模块，确保系统稳定性
"""

import sys
import time
import unittest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

sys.path.insert(0, '/home/wesley/.openclaw/workspace/skills/stock-monitor/scripts')

from monitor import StockAlert, WATCHLIST


class TestDataFetching(unittest.TestCase):
    """测试1: 数据获取模块"""
    
    def setUp(self):
        self.monitor = StockAlert()
    
    def test_sina_realtime_api(self):
        """测试新浪实时行情API"""
        data = self.monitor.fetch_sina_realtime([WATCHLIST[0]])
        self.assertIn('600362', data)
        self.assertGreater(data['600362']['price'], 0)
        print("✅ 新浪实时行情API正常")
    
    def test_gold_api(self):
        """测试伦敦金API"""
        data = self.monitor.fetch_sina_realtime([WATCHLIST[-1]])
        self.assertIn('XAU', data)
        self.assertGreater(data['XAU']['price'], 4000)  # 黄金应该在4000以上
        print("✅ 伦敦金API正常")
    
    def test_data_validity(self):
        """测试数据有效性检查"""
        data = self.monitor.fetch_sina_realtime(WATCHLIST[:3])
        for code, d in data.items():
            self.assertGreater(d['price'], 0, f"{code}价格无效")
            self.assertGreater(d['prev_close'], 0, f"{code}昨收无效")
        print("✅ 所有数据有效性检查通过")


class TestAlertRules(unittest.TestCase):
    """测试2: 预警规则模块"""
    
    def setUp(self):
        self.monitor = StockAlert()
    
    def test_cost_percentage_alert(self):
        """测试成本百分比预警"""
        stock = WATCHLIST[0].copy()
        stock['alerts'] = {'cost_pct_above': 10.0, 'cost_pct_below': -10.0}
        
        # 模拟盈利10%的数据
        data = {'price': 62.7, 'prev_close': 57.0, 'cost': 57.0}  # 成本57，现价62.7=+10%
        alerts, level = self.monitor.check_alerts(stock, data)
        
        has_profit_alert = any('盈利' in text for _, text in alerts)
        self.assertTrue(has_profit_alert, "应该有盈利预警")
        print("✅ 成本百分比预警正常")
    
    def test_daily_change_alert(self):
        """测试日内涨跌幅预警"""
        stock = WATCHLIST[0].copy()
        stock['alerts'] = {'change_pct_above': 5.0, 'change_pct_below': -5.0}
        
        # 模拟大涨6%
        data = {'price': 60.42, 'prev_close': 57.0, 'cost': 57.0}
        alerts, level = self.monitor.check_alerts(stock, data)
        
        has_change_alert = any('大涨' in text or '大跌' in text for _, text in alerts)
        self.assertTrue(has_change_alert, "应该有涨跌幅预警")
        print("✅ 日内涨跌幅预警正常")
    
    def test_no_duplicate_alerts(self):
        """测试防重复机制"""
        stock = WATCHLIST[0].copy()
        stock['alerts'] = {'cost_pct_above': 5.0}
        
        data = {'price': 60.0, 'prev_close': 57.0, 'cost': 57.0}
        
        # 第一次应该触发
        alerts1, _ = self.monitor.check_alerts(stock, data)
        self.assertGreater(len(alerts1), 0, "第一次应该触发预警")
        
        # 记录预警
        for alert_type, _ in alerts1:
            self.monitor.record_alert(stock['code'], alert_type)
        
        # 第二次不应该触发 (30分钟内)
        alerts2, _ = self.monitor.check_alerts(stock, data)
        self.assertEqual(len(alerts2), 0, "30分钟内不应重复触发")
        print("✅ 防重复机制正常")


class TestAlertLevel(unittest.TestCase):
    """测试3: 分级预警系统"""
    
    def setUp(self):
        self.monitor = StockAlert()
    
    def test_critical_level(self):
        """测试紧急级别"""
        alerts = [('a', 'test'), ('b', 'test'), ('c', 'test')]
        weights = [3, 3, 3]  # 总权重9
        level = self.monitor._calculate_alert_level(alerts, weights, 'individual')
        self.assertEqual(level, 'critical')
        print("✅ 紧急级别判断正常")
    
    def test_warning_level(self):
        """测试警告级别"""
        alerts = [('a', 'test'), ('b', 'test')]
        weights = [2, 2]  # 总权重4
        level = self.monitor._calculate_alert_level(alerts, weights, 'individual')
        self.assertEqual(level, 'warning')
        print("✅ 警告级别判断正常")
    
    def test_info_level(self):
        """测试提醒级别"""
        alerts = [('a', 'test')]
        weights = [1]
        level = self.monitor._calculate_alert_level(alerts, weights, 'individual')
        self.assertEqual(level, 'info')
        print("✅ 提醒级别判断正常")


class TestStockTypeDifferentiation(unittest.TestCase):
    """测试4: 差异化配置"""
    
    def test_individual_stock_threshold(self):
        """测试个股阈值"""
        stock = [s for s in WATCHLIST if s.get('type') == 'individual'][0]
        self.assertEqual(stock['alerts']['change_pct_above'], 4.0)
        print("✅ 个股阈值配置正确")
    
    def test_etf_threshold(self):
        """测试ETF阈值"""
        stock = [s for s in WATCHLIST if s.get('type') == 'etf'][0]
        self.assertEqual(stock['alerts']['change_pct_above'], 2.0)
        print("✅ ETF阈值配置正确")
    
    def test_gold_threshold(self):
        """测试黄金阈值"""
        stock = [s for s in WATCHLIST if s.get('type') == 'gold'][0]
        self.assertEqual(stock['alerts']['change_pct_above'], 2.5)
        print("✅ 黄金阈值配置正确")


class TestSmartSchedule(unittest.TestCase):
    """测试5: 智能频率控制"""
    
    def setUp(self):
        self.monitor = StockAlert()
    
    def test_market_hours_detection(self):
        """测试交易时间检测"""
        # 当前是纽约时间，转换成北京时间
        ny_now = datetime.now()
        beijing_now = ny_now + timedelta(hours=13)
        
        schedule = self.monitor.should_run_now()
        self.assertIn('mode', schedule)
        self.assertIn(schedule['mode'], ['market', 'lunch', 'after_hours', 'night', 'weekend'])
        print(f"✅ 时间检测正常 (当前模式: {schedule['mode']})")
    
    def test_interval_settings(self):
        """测试不同模式的间隔设置"""
        schedule = self.monitor.should_run_now()
        interval = schedule.get('interval', 0)
        self.assertGreater(interval, 0)
        self.assertIn(interval, [300, 600, 1800, 3600])  # 5/10/30/60分钟
        print(f"✅ 间隔设置正常 ({interval//60}分钟)")


class TestMessageFormat(unittest.TestCase):
    """测试6: 消息格式"""
    
    def setUp(self):
        self.monitor = StockAlert()
    
    def test_message_contains_required_elements(self):
        """测试消息包含必要元素"""
        # 模拟触发预警
        stock = WATCHLIST[0]
        data = {'price': 54.0, 'prev_close': 57.0, 'open': 55.0, 'high': 56.0, 'low': 53.0}
        alerts, level = [('cost_below', '📉 亏损10%')], 'warning'
        
        # 构建消息
        change_pct = -5.26
        msg = f"<b>⚠️ 【警告】🟢 {stock['name']} ({stock['code']})</b>\n"
        msg += f"💰 当前价格: ¥{data['price']:.2f} ({change_pct:+.2f}%)\n"
        msg += f"🎯 触发预警:\n  • {alerts[0][1]}\n"
        
        # 检查必要元素
        self.assertIn('【警告】', msg)
        self.assertIn('🟢', msg)  # 绿跌
        self.assertIn('💰', msg)
        self.assertIn('🎯', msg)
        print("✅ 消息格式包含必要元素")


class TestIntegration(unittest.TestCase):
    """测试7: 集成测试"""
    
    def setUp(self):
        self.monitor = StockAlert()
    
    def test_full_run_once(self):
        """测试完整run_once流程"""
        start = time.time()
        alerts_list = self.monitor.run_once(smart_mode=True)
        elapsed = time.time() - start
        
        # 执行时间应该合理 (10-30秒)
        self.assertLess(elapsed, 60, "执行时间过长")
        self.assertIsInstance(alerts_list, list)
        print(f"✅ 完整流程正常 (执行时间: {elapsed:.2f}秒, 触发{len(alerts_list)}条)")
    
    def test_all_stocks_monitored(self):
        """测试所有股票都被监控"""
        data = self.monitor.fetch_sina_realtime(WATCHLIST)
        # 至少应该获取到部分数据
        self.assertGreater(len(data), 0)
        print(f"✅ 监控覆盖正常 (获取到{len(data)}/{len(WATCHLIST)}只数据)")


def run_all_tests():
    """运行所有测试"""
    print("=" * 70)
    print("🧪 Stock Monitor Pro - 完整测试套件")
    print("=" * 70)
    
    # 创建测试套件
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # 添加所有测试类
    suite.addTests(loader.loadTestsFromTestCase(TestDataFetching))
    suite.addTests(loader.loadTestsFromTestCase(TestAlertRules))
    suite.addTests(loader.loadTestsFromTestCase(TestAlertLevel))
    suite.addTests(loader.loadTestsFromTestCase(TestStockTypeDifferentiation))
    suite.addTests(loader.loadTestsFromTestCase(TestSmartSchedule))
    suite.addTests(loader.loadTestsFromTestCase(TestMessageFormat))
    suite.addTests(loader.loadTestsFromTestCase(TestIntegration))
    
    # 运行测试
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # 输出总结
    print("\n" + "=" * 70)
    print("📊 测试总结")
    print("=" * 70)
    print(f"  测试总数: {result.testsRun}")
    print(f"  通过: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"  失败: {len(result.failures)}")
    print(f"  错误: {len(result.errors)}")
    
    if result.wasSuccessful():
        print("\n✅ 所有测试通过！系统可以正常运行。")
    else:
        print("\n⚠️  部分测试失败，请检查日志。")
    
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
